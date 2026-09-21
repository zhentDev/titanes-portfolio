"""
Authentication REST API Router for Titanes Portfolio.
Endpoints:
- POST /api/auth/register: Local registration with email & password
- POST /api/auth/login: Local login with email & password
- POST /api/auth/oauth: Google OAuth2 ID token login / registration
- GET  /api/auth/me: Returns current authenticated user profile
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from services import db
from services.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_google_oauth_token,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class OAuthRequest(BaseModel):
    id_token: str
    provider: Optional[str] = "google"
    name: Optional[str] = None
    email: Optional[str] = None


def _clean_user_dict(u: dict) -> dict:
    is_owner = bool(u.get("email") and u["email"].lower().strip() == "caballerojesus703@hotmail.com")
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "provider": u.get("provider", "local"),
        "avatar_url": u.get("avatar_url"),
        "created_at": u.get("created_at"),
        "is_pro": bool(u.get("is_pro") or is_owner),
    }


@router.post("/register")
def register(payload: RegisterRequest):
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Por favor ingresa un correo electrónico válido.",
        )
    if not payload.password or len(payload.password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener al menos 4 caracteres.",
        )

    existing = db.get_user_by_email(email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una cuenta registrada con este correo.",
        )

    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    pwd_hash = hash_password(payload.password)
    user_name = payload.name.strip() if payload.name and payload.name.strip() else email.split("@")[0]

    is_first_user = db.count_users() == 0

    new_user = db.create_user({
        "id": user_id,
        "email": email,
        "name": user_name,
        "password_hash": pwd_hash,
        "provider": "local",
        "avatar_url": None,
    })

    # Claim existing legacy portfolio data for the primary user so nothing is lost
    if is_first_user:
        try:
            db.claim_legacy_data(user_id)
            logger.info(f"Assigned legacy portfolio data to primary user {user_id}")
        except Exception as e:
            logger.error(f"Error claiming legacy data: {e}")

    token = create_access_token({"sub": user_id, "email": email, "name": user_name})

    return {
        "token": token,
        "user": _clean_user_dict(new_user),
        "claimed_legacy_data": is_first_user,
    }


@router.post("/login")
def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    user = db.get_user_by_email(email)
    if not user or not user.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        )

    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        )

    token = create_access_token({"sub": user["id"], "email": user["email"], "name": user["name"]})

    return {
        "token": token,
        "user": _clean_user_dict(user),
    }


@router.post("/oauth")
async def oauth_login(payload: OAuthRequest):
    """
    Handles Google OAuth2 login & registration.
    Verifies id_token with Google tokeninfo endpoint, or handles standard OAuth token.
    """
    id_token = payload.id_token.strip()
    profile = None

    # Check for demo/sandbox token for instant evaluation without OAuth secrets
    if id_token.startswith("demo_google_") or id_token == "demo-google-oauth-token":
        demo_email = payload.email or "usuario.google@ejemplo.com"
        demo_name = payload.name or "Usuario Google"
        profile = {
            "email": demo_email.lower().strip(),
            "name": demo_name,
            "picture": "https://lh3.googleusercontent.com/a/default-user",
            "sub": f"google_demo_{hash(demo_email)}",
            "provider": "google",
        }
    else:
        profile = await verify_google_oauth_token(id_token)

    if not profile or not profile.get("email"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fue posible verificar el token de Google OAuth2.",
        )

    email = profile["email"].lower().strip()
    user = db.get_user_by_email(email)

    if not user:
        is_first = db.count_users() == 0
        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        user = db.create_user({
            "id": user_id,
            "email": email,
            "name": profile.get("name") or email.split("@")[0],
            "password_hash": None,
            "provider": "google",
            "provider_id": profile.get("sub"),
            "avatar_url": profile.get("picture"),
        })
        if is_first:
            try:
                db.claim_legacy_data(user_id)
            except Exception as e:
                logger.error(f"Error claiming legacy data in OAuth: {e}")
    else:
        user_id = user["id"]

    token = create_access_token({"sub": user_id, "email": email, "name": user["name"]})

    return {
        "token": token,
        "user": _clean_user_dict(user),
    }


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token no contiene identificador de usuario.")

    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    return {
        "user": _clean_user_dict(user),
    }
