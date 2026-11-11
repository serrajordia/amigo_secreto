"""Linha de comando.

Exemplos::

    python -m amigo_secreto sortear participantes.csv --simular
    python -m amigo_secreto sortear participantes.csv --festa "24/12 19h" --valor "R$ 100"
    python -m amigo_secreto testar-email
    python -m amigo_secreto configurar
"""

from __future__ import annotations

import argparse
import csv
import getpass
import io
import sys
import unicodedata
from pathlib import Path

from .sorteio import Participante, Regras, SorteioImpossivel, sortear, verificar

COLUNAS = {
    "nome": {"nome", "name", "participante"},
    "email": {"email", "e-mail", "mail", "e_mail"},
    "grupo": {"grupo", "familia", "grupo familiar", "group", "nucleo"},
}


def _normaliza(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.strip().casefold())
    return "".join(c for c in s if not unicodedata.combining(c))


def ler_csv(caminho: str | Path) -> list[Participante]:
    """Lê CSV com colunas nome, email, grupo (separador , ; ou tab; com ou sem acentos)."""
    texto = Path(caminho).read_text(encoding="utf-8-sig")
    try:
        dialeto = csv.Sniffer().sniff(texto.splitlines()[0], delimiters=",;\t")
    except csv.Error:
        dialeto = csv.excel
    linhas = list(csv.reader(io.StringIO(texto), dialeto))
    if not linhas:
        return []

    cab = [_normaliza(c) for c in linhas[0]]
    idx = {}
    for chave, nomes in COLUNAS.items():
        for k, c in enumerate(cab):
            if c in nomes:
                idx[chave] = k
    if "nome" in idx and "email" in idx:
        corpo = linhas[1:]
    else:  # sem cabeçalho: assume nome, email, grupo
        idx, corpo = {"nome": 0, "email": 1, "grupo": 2}, linhas

    def col(linha, chave):
        k = idx.get(chave)
        return linha[k].strip() if k is not None and k < len(linha) else ""

    return [
        Participante(col(l, "nome"), col(l, "email"), col(l, "grupo"))
        for l in corpo
        if any(c.strip() for c in l)
    ]


def _cmd_sortear(a) -> int:
    ps = ler_csv(a.arquivo)
    regras = Regras(
        permitir_autossorteio=a.permitir_autossorteio,
        permitir_mesmo_grupo=a.permitir_mesmo_grupo,
        corrente_unica=a.corrente,
    )
    v = verificar(ps, regras)
    for aviso in v.avisos:
        print("⚠", aviso)
    if not v.viavel:
        for erro in v.erros:
            print("✗", erro)
        return 2

    try:
        destino = sortear(ps, regras)
    except SorteioImpossivel as e:
        print("✗", e)
        return 2

    grupos = len({p.grupo for p in ps if p.grupo})
    print(f"✓ Sorteio válido para {len(ps)} participantes em {grupos} grupo(s). Resultado não exibido.")
    if a.simular:
        print("Modo simulação: nenhum e-mail enviado.")
        return 0

    from .config import carregar_credenciais
    from .envio import Evento, enviar_resultados

    evento = Evento(a.evento, a.festa, a.local, a.valor, a.mensagem, a.organizador)
    if not a.sim:
        resp = input(f"Enviar {len(ps)} e-mails agora? [s/N] ").strip().lower()
        if resp not in {"s", "sim", "y"}:
            print("Cancelado. Nada foi enviado.")
            return 1
    n = enviar_resultados(carregar_credenciais(), ps, destino, evento)
    print(f"✓ {n} e-mails enviados.")
    return 0


def _cmd_testar(a) -> int:
    from .config import carregar_credenciais
    from .envio import enviar_teste

    cred = carregar_credenciais()
    enviar_teste(cred, a.para)
    print(f"✓ E-mail de teste enviado para {a.para or cred.usuario}.")
    return 0


def _cmd_configurar(_a) -> int:
    from .config import salvar_no_keyring

    usuario = input("Seu Gmail: ").strip()
    senha = getpass.getpass("Senha de app (16 letras, não aparece na tela): ")
    salvar_no_keyring(usuario, senha)
    print("✓ Credenciais salvas no cofre do sistema. Nada foi gravado em arquivo.")
    return 0


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(prog="amigo_secreto", description="Sorteio de amigo secreto")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sortear", help="sorteia e envia os e-mails")
    s.add_argument("arquivo", help="CSV com colunas nome,email,grupo")
    s.add_argument("--permitir-mesmo-grupo", action="store_true", help="pode tirar alguém do próprio grupo")
    s.add_argument("--permitir-autossorteio", action="store_true", help="pode tirar a si mesmo")
    s.add_argument("--corrente", action="store_true", help="forma uma única corrente A→B→…→A")
    s.add_argument("--simular", action="store_true", help="só verifica, não envia nada")
    s.add_argument("--sim", action="store_true", help="não pede confirmação antes de enviar")
    s.add_argument("--evento", default="Amigo Secreto")
    s.add_argument("--festa", default="", help="data/hora da festa")
    s.add_argument("--local", default="")
    s.add_argument("--valor", default="", help="valor sugerido do presente")
    s.add_argument("--mensagem", default="")
    s.add_argument("--organizador", default="")
    s.set_defaults(func=_cmd_sortear)

    t = sub.add_parser("testar-email", help="envia um e-mail de teste")
    t.add_argument("--para", default=None)
    t.set_defaults(func=_cmd_testar)

    c = sub.add_parser("configurar", help="salva Gmail e senha de app no cofre do sistema")
    c.set_defaults(func=_cmd_configurar)

    a = p.parse_args(argv)
    return a.func(a)
