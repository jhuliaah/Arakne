"""Application configuration — reads from environment variables.

LNbits keys are empty by default; the backend falls back to mock mode.
To enable real Lightning payments, set LNBITS_ADMIN_KEY and LNBITS_POOL_KEY
after creating wallets in the LNbits UI (http://localhost:5000).
"""

import os

LNBITS_URL = os.getenv("LNBITS_URL", "http://lnbits:5000")
LNBITS_ADMIN_KEY = os.getenv("LNBITS_ADMIN_KEY", "")
LNBITS_POOL_KEY = os.getenv("LNBITS_POOL_KEY", "")
