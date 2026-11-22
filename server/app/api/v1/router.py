from fastapi import APIRouter

from .auth import router as auth_router
from .towers import router as towers_router
from .trades import router as trades_router
from .complaints import router as complaints_router

router = APIRouter(prefix="/api/v1")

router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(towers_router, prefix="/towers", tags=["towers"])
router.include_router(trades_router, prefix="/trades", tags=["trades"])
router.include_router(complaints_router, prefix="/complaints", tags=["complaints"])
