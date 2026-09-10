import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/features/auth/components/LoginForm";
import bg from "@/assets/images/1.png";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#dbe7e6]">
      {/* full artwork, never cropped */}
      <Image
        src={bg}
        alt="TITAN — Manufacturing Excellence"
        fill
        priority
        sizes="100vw"
        placeholder="blur"
        className="object-contain object-left-top"
      />
      {/* soft wash so the card side blends with the artwork's pale right edge */}
      <div className="absolute inset-0 bg-gradient-to-l from-[#dbe7e6] via-[#dbe7e6]/40 to-transparent md:via-transparent" />

      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10 md:justify-end md:pr-[13vw]">
        <LoginForm />
      </div>
    </div>
  );
}
