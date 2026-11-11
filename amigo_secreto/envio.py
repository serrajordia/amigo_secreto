"""Envio dos resultados por e-mail (Gmail SMTP com senha de app)."""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from html import escape
from typing import Sequence

from .config import Credenciais
from .sorteio import Participante

SMTP_HOST, SMTP_PORTA = "smtp.gmail.com", 465

AZUL_CLARO, AZUL, GRAFITE, CINZA = "#29A9E0", "#0071BC", "#3D4654", "#737A8C"


@dataclass(frozen=True)
class Evento:
    nome: str = "Amigo Secreto"
    data_festa: str = ""
    local: str = ""
    valor_sugerido: str = ""
    mensagem: str = ""
    organizador: str = ""


def _linhas_evento(ev: Evento) -> list[tuple[str, str]]:
    return [
        (rotulo, valor)
        for rotulo, valor in (
            ("Data da festa", ev.data_festa),
            ("Local", ev.local),
            ("Valor sugerido", ev.valor_sugerido),
            ("Organização", ev.organizador),
        )
        if valor
    ]


def montar_mensagem(remetente: str, quem: Participante, tirou: Participante, ev: Evento) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = f"{ev.nome} <{remetente}>"
    msg["To"] = quem.email
    msg["Subject"] = f"🎁 {ev.nome}: seu amigo secreto chegou!"

    texto = [f"Olá, {quem.nome}!", "", f"No {ev.nome}, você tirou:", "", f"*** {tirou.nome} ***", ""]
    texto += [f"{r}: {v}" for r, v in _linhas_evento(ev)]
    if ev.mensagem:
        texto += ["", ev.mensagem]
    texto += ["", "Guarde segredo! 🤫"]
    msg.set_content("\n".join(texto))

    detalhes = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:{CINZA}">{escape(r)}</td>'
        f'<td style="padding:4px 0;color:{GRAFITE};font-weight:600">{escape(v)}</td></tr>'
        for r, v in _linhas_evento(ev)
    )
    recado = (
        f'<p style="margin:20px 0 0;color:{GRAFITE};white-space:pre-line">{escape(ev.mensagem)}</p>'
        if ev.mensagem
        else ""
    )
    msg.add_alternative(
        f"""<div style="font-family:Arial,Helvetica,sans-serif;background:#f2f6fa;padding:24px">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dde5ee">
    <div style="background:{AZUL};background:linear-gradient(135deg,{AZUL},{AZUL_CLARO});padding:20px 24px;color:#fff">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.85">{escape(ev.nome)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">Olá, {escape(quem.nome)}!</div>
    </div>
    <div style="padding:24px">
      <p style="margin:0;color:{GRAFITE}">Você tirou…</p>
      <p style="margin:12px 0 20px;font-size:30px;font-weight:800;color:{AZUL}">{escape(tirou.nome)}</p>
      <table style="border-collapse:collapse;font-size:14px">{detalhes}</table>
      {recado}
      <p style="margin:24px 0 0;color:{CINZA};font-size:13px">Guarde segredo! 🤫</p>
    </div>
  </div>
</div>""",
        subtype="html",
    )
    return msg


def enviar_resultados(
    cred: Credenciais,
    ps: Sequence[Participante],
    destino: Sequence[int],
    evento: Evento,
    log=print,
) -> int:
    """Envia um e-mail por participante. O log mostra só quem recebeu, nunca quem tirou quem."""
    enviados = 0
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORTA) as smtp:
        smtp.login(cred.usuario, cred.senha_app)
        for i, j in enumerate(destino):
            smtp.send_message(montar_mensagem(cred.usuario, ps[i], ps[j], evento))
            enviados += 1
            log(f"✓ e-mail enviado para {ps[i].nome} <{ps[i].email}>")
    return enviados


def enviar_teste(cred: Credenciais, para: str | None = None) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"] = cred.usuario, para or cred.usuario
    msg["Subject"] = "Amigo Secreto — teste de conexão"
    msg.set_content("Se você recebeu este e-mail, a conexão com o Gmail está funcionando. 🎉")
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORTA) as smtp:
        smtp.login(cred.usuario, cred.senha_app)
        smtp.send_message(msg)
