"""Release version for Nexus backend."""
import os

VERSION = os.environ.get("RELEASE_VERSION", "0.1.0-dev")
BUILD_SHA = os.environ.get("BUILD_SHA", "unknown")
