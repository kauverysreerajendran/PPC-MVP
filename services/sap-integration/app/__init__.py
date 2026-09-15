"""SAP Integration Service — a standalone microservice.

Owns the `sap` schema in the single shared database. Never imported by, and
never imports, the monolith or any other service. Cross-service access is
HTTP-only, through the gateway.
"""

__version__ = "0.1.0"
