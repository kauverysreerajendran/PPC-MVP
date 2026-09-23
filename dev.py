#!/usr/bin/env python
"""One command for the whole local stack (native run, no Docker).

    python dev.py              start everything that is not already running
    python dev.py --check      just report which process / port is up
    python dev.py --migrate    run `alembic upgrade head` in each service first
    python dev.py --only backend,masterdata
    python dev.py --no-frontend

Why this exists: the app is SIX processes — Next.js (:3000) proxies /api/v1/*
to the backend monolith (:8000) and four microservices (sap-integration :8001,
masterdata :8002, rack :8003, status :8004). When any one of them is not
running, every call the browser makes to it comes back from the Next proxy as a
bare `500 Internal Server Error`, which looks like an application bug. This
script starts them all in one terminal, prefixes every log line with the
process name, waits until each `/healthz` answers, and prints a summary.

Ports that are already in use are left alone (the process you started by hand
keeps running); Ctrl+C stops everything this script started.
"""

from __future__ import annotations

import argparse
import contextlib
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PY = sys.executable
IS_WIN = os.name == "nt"

# A Windows console (and a redirected stdout) defaults to cp1252, which cannot
# encode the arrows/ellipses this script prints — nor whatever a service logs.
# Without this, one such character raises UnicodeEncodeError inside emit() and
# takes the whole stack down with it.
for _stream in (sys.stdout, sys.stderr):
    with contextlib.suppress(AttributeError, ValueError):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# Every line printed also lands here (without colours), so the run can be read
# back from a file — handy when the terminal is not in front of you.
LOG_PATH = ROOT / ".dev" / "stack.log"
_log_file = None
_log_lock = threading.Lock()


def emit(text: str) -> None:
    """Print to the console and append (colour-stripped) to LOG_PATH."""
    sys.stdout.write(text + "\n")
    sys.stdout.flush()
    if _log_file is not None:
        plain = text
        for code in C.values():
            plain = plain.replace(code, "")
        with _log_lock:
            _log_file.write(plain + "\n")
            _log_file.flush()


@dataclass
class Proc:
    name: str
    cwd: Path
    port: int
    cmd: list[str]
    health: str
    color: str
    migrate: list[str] | None = None
    url: str = ""
    popen: subprocess.Popen | None = field(default=None, repr=False)


# ANSI colours (Windows 10+ terminals understand them once VT mode is on).
C = {
    "reset": "\x1b[0m",
    "dim": "\x1b[2m",
    "red": "\x1b[31m",
    "green": "\x1b[32m",
    "yellow": "\x1b[33m",
    "blue": "\x1b[34m",
    "magenta": "\x1b[35m",
    "cyan": "\x1b[36m",
    "white": "\x1b[37m",
}


def uvicorn(port: int) -> list[str]:
    return [
        PY, "-m", "uvicorn", "app.main:app",
        "--host", "127.0.0.1", "--port", str(port), "--reload",
    ]


def npm_dev() -> list[str]:
    # `npm` is a .cmd shim on Windows; run it through cmd.exe so the tree is
    # one process group that `taskkill /T` can stop.
    return ["cmd", "/c", "npm", "run", "dev"] if IS_WIN else ["npm", "run", "dev"]


PROCS: list[Proc] = [
    Proc(
        name="backend", cwd=ROOT / "backend", port=8000, cmd=uvicorn(8000),
        health="http://127.0.0.1:8000/healthz", color="blue",
        migrate=[PY, "-m", "alembic", "upgrade", "head"],
        url="http://localhost:8000/api/v1/docs",
    ),
    Proc(
        name="sap", cwd=ROOT / "services" / "sap-integration", port=8001, cmd=uvicorn(8001),
        health="http://127.0.0.1:8001/healthz", color="magenta",
        migrate=[PY, "-m", "alembic", "upgrade", "head"],
        url="http://localhost:8001/api/v1/sap/docs",
    ),
    Proc(
        name="masterdata", cwd=ROOT / "services" / "masterdata", port=8002, cmd=uvicorn(8002),
        health="http://127.0.0.1:8002/healthz", color="cyan",
        migrate=[PY, "-m", "alembic", "upgrade", "head"],
        url="http://localhost:8002/api/v1/masterdata/docs",
    ),
    Proc(
        name="rack", cwd=ROOT / "services" / "rack", port=8003, cmd=uvicorn(8003),
        health="http://127.0.0.1:8003/healthz", color="yellow",
        migrate=[PY, "-m", "alembic", "upgrade", "head"],
        url="http://localhost:8003/api/v1/rack/docs",
    ),
    Proc(
        name="status", cwd=ROOT / "services" / "status", port=8004, cmd=uvicorn(8004),
        health="http://127.0.0.1:8004/healthz", color="green",
        migrate=[PY, "-m", "alembic", "upgrade", "head"],
        url="http://localhost:8004/api/v1/status/docs",
    ),
    Proc(
        name="frontend", cwd=ROOT / "frontend", port=3000, cmd=npm_dev(),
        health="http://127.0.0.1:3000/api/healthz", color="white",
        url="http://localhost:3000",
    ),
]


# --------------------------------------------------------------------------- helpers

def enable_ansi() -> None:
    if not IS_WIN:
        return
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        handle = kernel32.GetStdHandle(-11)
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            kernel32.SetConsoleMode(handle, mode.value | 0x0004)
    except Exception:  # noqa: BLE001 - cosmetic only
        pass


def paint(text: str, color: str) -> str:
    return f"{C[color]}{text}{C['reset']}"


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


def http_ok(url: str, timeout: float = 4.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:  # noqa: S310 - localhost
            return 200 <= r.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


def load_dotenv(path: Path) -> dict[str, str]:
    """Minimal `.env` reader: KEY=VALUE, `#` comments, optional quotes.
    Values already in the environment win (so a shell override still works)."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and key not in os.environ:
            out[key] = value
    return out


def postgres_reachable(env: dict[str, str]) -> tuple[str, int, bool]:
    host = env.get("POSTGRES_HOST", "127.0.0.1")
    port = int(env.get("POSTGRES_PORT", "5432"))
    return host, port, port_open(port, "127.0.0.1" if host == "localhost" else host)


# --------------------------------------------------------------------------- run

def pump(proc: Proc) -> None:
    """Copy a child's stdout to ours with a coloured `[name]` prefix."""
    assert proc.popen is not None and proc.popen.stdout is not None
    prefix = paint(f"[{proc.name:<10}]", proc.color)
    for line in iter(proc.popen.stdout.readline, b""):
        emit(f"{prefix} {line.decode('utf-8', 'replace').rstrip()}")


def spawn(proc: Proc, env: dict[str, str]) -> None:
    kwargs: dict = {
        "cwd": str(proc.cwd),
        "env": env,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
    }
    if IS_WIN:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        kwargs["start_new_session"] = True
    proc.popen = subprocess.Popen(proc.cmd, **kwargs)  # noqa: S603
    threading.Thread(target=pump, args=(proc,), daemon=True).start()


def stop(proc: Proc) -> None:
    p = proc.popen
    if p is None or p.poll() is not None:
        return
    try:
        if IS_WIN:
            # uvicorn --reload and npm both fork; kill the whole tree.
            subprocess.run(  # noqa: S603,S607
                ["taskkill", "/F", "/T", "/PID", str(p.pid)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
            )
        else:
            os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        p.wait(timeout=8)
    except Exception:  # noqa: BLE001
        with contextlib.suppress(Exception):
            p.kill()


def run_migrations(procs: list[Proc], env: dict[str, str]) -> None:
    for proc in procs:
        if not proc.migrate:
            continue
        emit(paint(f"[{proc.name:<10}] alembic upgrade head", proc.color))
        r = subprocess.run(proc.migrate, cwd=str(proc.cwd), env=env, check=False)  # noqa: S603
        if r.returncode != 0:
            emit(paint(f"[{proc.name:<10}] migration FAILED (exit {r.returncode})", "red"))
def wait_healthy(procs: list[Proc], timeout: float) -> None:
    deadline = time.time() + timeout
    pending = {p.name: p for p in procs}
    while pending and time.time() < deadline:
        for name, p in list(pending.items()):
            if p.popen is not None and p.popen.poll() is not None:
                emit(paint(f"[{name:<10}] exited with code {p.popen.returncode} — see its log above", "red"))
                del pending[name]
            elif http_ok(p.health):
                emit(paint(f"[{name:<10}] ready  →  {p.url}", "green"))
                del pending[name]
        time.sleep(0.5)
    for name in pending:
        emit(paint(f"[{name:<10}] still not answering {pending[name].health} after {int(timeout)}s", "yellow"))
def report(env: dict[str, str]) -> int:
    host, port, ok = postgres_reachable(env)
    emit(f"  {'postgres':<10} {host}:{port:<5} {paint('UP', 'green') if ok else paint('DOWN', 'red')}")
    down = 0 if ok else 1
    for p in PROCS:
        up = http_ok(p.health)
        listening = port_open(p.port)
        state = paint("UP", "green") if up else (paint("PORT BUSY, no /healthz", "yellow") if listening else paint("DOWN", "red"))
        emit(f"  {p.name:<10} :{p.port:<9} {state}   {C['dim']}{p.url}{C['reset']}")
        down += 0 if up else 1
    return down


def main() -> int:
    global _log_file
    enable_ansi()
    LOG_PATH.parent.mkdir(exist_ok=True)
    _log_file = open(LOG_PATH, "a", encoding="utf-8")  # noqa: SIM115
    emit(paint(f"--- dev.py {time.strftime('%Y-%m-%d %H:%M:%S')}  (log: {LOG_PATH})", "dim"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="report status only, start nothing")
    ap.add_argument("--migrate", action="store_true", help="run alembic upgrade head in each service before starting it")
    ap.add_argument("--only", default="", help="comma-separated subset: backend,sap,masterdata,rack,status,frontend")
    ap.add_argument("--no-frontend", action="store_true", help="skip `npm run dev`")
    ap.add_argument("--timeout", type=float, default=90, help="seconds to wait for /healthz (default 90)")
    args = ap.parse_args()

    env = dict(os.environ)
    env.update(load_dotenv(ROOT / ".env"))
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("FORCE_COLOR", "1")

    if args.check:
        emit("Stack status:")
        return 1 if report(env) else 0

    wanted = {s.strip() for s in args.only.split(",") if s.strip()} or {p.name for p in PROCS}
    if args.no_frontend:
        wanted.discard("frontend")
    unknown = wanted - {p.name for p in PROCS}
    if unknown:
        emit(paint(f"unknown process name(s): {', '.join(sorted(unknown))}", "red"))
        return 2

    host, port, pg_ok = postgres_reachable(env)
    if not pg_ok:
        emit(paint(f"PostgreSQL is not listening on {host}:{port} — every service will fail on its first query. "
                    f"Start it, then rerun.", "red"))

    to_start: list[Proc] = []
    for p in PROCS:
        if p.name not in wanted:
            continue
        if port_open(p.port):
            emit(paint(f"[{p.name:<10}] already listening on :{p.port} — leaving it alone", "dim"))
            continue
        to_start.append(p)

    if not to_start:
        emit(paint("Nothing to start — everything is already up.", "green"))
        return 0

    if args.migrate:
        run_migrations(to_start, env)

    emit(paint(f"Starting: {', '.join(p.name for p in to_start)}  (Ctrl+C stops them)", "dim"))
    for p in to_start:
        spawn(p, env)

    try:
        wait_healthy(to_start, args.timeout)
        emit("")
        emit("Stack status:")
        report(env)
        emit("")
        # Keep running until Ctrl+C or every child has exited.
        while any(p.popen is not None and p.popen.poll() is None for p in to_start):
            time.sleep(1)
        emit(paint("all started processes have exited", "yellow"))
        return 1
    except KeyboardInterrupt:
        emit("")
        emit(paint("stopping…", "dim"))
        return 0
    finally:
        for p in to_start:
            stop(p)


if __name__ == "__main__":
    sys.exit(main())
