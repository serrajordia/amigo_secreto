"""Linha de comando.

Exemplos::

    python -m amigo_secreto sortear participantes.csv --simular
    python -m amigo_secreto sortear participantes.csv --festa "24/12 19h" --valor "R$ 100"
    python -m amigo_secreto sortear participantes.csv --gerar-codigo        # sorteio reprodutível
    python -m amigo_secreto sortear participantes.csv --codigo 1-XXXX-… --so "Ana"   # reenvia só para a Ana
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

from .sorteio import (
    CodigoInvalido,
    Participante,
    Regras,
    SorteioImpossivel,
    ler_codigo,
    novo_codigo,
    sortear,
    verificar,
)

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

    if a.so and not a.codigo:
        print("✗ --so só faz sentido com --codigo (refazer um sorteio já feito).")
        return 2
    somente = None
    if a.so:
        alvo = _normaliza(a.so)
        somente = [i for i, p in enumerate(ps) if alvo in (_normaliza(p.nome), _normaliza(p.email))]
        if len(somente) != 1:
            print(f"✗ '{a.so}' corresponde a {len(somente)} participantes. Use o nome completo ou o e-mail.")
            return 2

    codigo = None
    try:
        if a.codigo or a.gerar_codigo:
            codigo = ler_codigo(a.codigo or novo_codigo(ps, regras), ps, regras)
        destino = sortear(ps, regras, codigo.gerador() if codigo else None)
    except (SorteioImpossivel, CodigoInvalido) as e:
        print("✗", e)
        return 2

    grupos = len({p.grupo for p in ps if p.grupo})
    print(f"✓ Sorteio válido para {len(ps)} participantes em {grupos} grupo(s). Resultado não exibido.")
    if codigo:
        print(f"  Sorteio #{codigo.apelido}")
        if a.gerar_codigo:
            print(f"  Código de recuperação: {codigo.codigo}")
            print("  Guarde-o só com você. Com ele e esta mesma lista (mesma ordem, grupos e regras),")
            print("  dá para reenviar o e-mail de quem perder: --codigo <código> --so <nome>.")
            print("  Quem tiver o código e a lista consegue descobrir o sorteio inteiro.")
    if a.simular:
        print("Modo simulação: nenhum e-mail enviado.")
        return 0

    from .config import carregar_credenciais
    from .envio import Evento, enviar_resultados

    evento = Evento(a.evento, a.festa, a.local, a.valor, a.mensagem, a.organizador)
    n_envios = len(somente) if somente is not None else len(ps)
    if not a.sim:
        resp = input(f"Enviar {n_envios} e-mail(s) agora? [s/N] ").strip().lower()
        if resp not in {"s", "sim", "y"}:
            print("Cancelado. Nada foi enviado.")
            return 1
    n = enviar_resultados(
        carregar_credenciais(), ps, destino, evento,
        apelido=codigo.apelido if codigo else "", somente=somente,
    )
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
    s.add_argument("--gerar-codigo", action="store_true", help="sorteio reprodutível: mostra um código de recuperação")
    s.add_argument("--codigo", default=None, help="refaz o sorteio de um código de recuperação (mesma lista)")
    s.add_argument("--so", default=None, help="com --codigo: envia só para esta pessoa (nome ou e-mail)")
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
