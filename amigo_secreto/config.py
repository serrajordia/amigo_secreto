"""Leitura das credenciais do Gmail sem nunca deixá-las no código.

Ordem de busca (a primeira que existir vence):
1. Variáveis de ambiente ``GMAIL_USER`` e ``GMAIL_APP_PASSWORD``;
2. Arquivo ``.env`` na pasta atual (ignorado pelo git — veja ``.env.example``);
3. Cofre de credenciais do sistema (Windows Credential Manager / Keychain),
   gravado com ``python -m amigo_secreto configurar`` (requer ``pip install keyring``).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

SERVICO_KEYRING = "amigo_secreto_gmail"


@dataclass(frozen=True)
class Credenciais:
    usuario: str
    senha_app: str

    def __repr__(self) -> str:  # nunca imprime a senha
        return f"Credenciais(usuario={self.usuario!r}, senha_app='***')"


def _carregar_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(override=False)


def _keyring():
    try:
        import keyring
    except ImportError:
        return None
    return keyring


def carregar_credenciais() -> Credenciais:
    _carregar_dotenv()
    usuario = os.getenv("GMAIL_USER", "").strip()
    senha = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "")

    kr = _keyring()
    if kr and usuario and not senha:
        senha = (kr.get_password(SERVICO_KEYRING, usuario) or "").replace(" ", "")
    if kr and not usuario:
        usuario = kr.get_password(SERVICO_KEYRING, "__usuario__") or ""
        if usuario:
            senha = (kr.get_password(SERVICO_KEYRING, usuario) or "").replace(" ", "")

    if not usuario or not senha:
        raise RuntimeError(
            "Credenciais do Gmail não encontradas. Crie um arquivo .env a partir de "
            ".env.example ou rode: python -m amigo_secreto configurar"
        )
    return Credenciais(usuario, senha)


def salvar_no_keyring(usuario: str, senha_app: str) -> None:
    kr = _keyring()
    if kr is None:
        raise RuntimeError("Instale o pacote 'keyring' (pip install keyring) para usar o cofre.")
    kr.set_password(SERVICO_KEYRING, "__usuario__", usuario)
    kr.set_password(SERVICO_KEYRING, usuario, senha_app.replace(" ", ""))
