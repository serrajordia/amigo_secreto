"""Algoritmo do sorteio de amigo secreto.

Mesma lógica de ``docs/js/sorteio.js`` (usado pela interface web e pelo Apps Script).

Ideia geral
-----------
* Cada participante é identificado pela sua posição na lista (nomes podem repetir).
* ``pode_tirar(i, j)`` diz se ``i`` pode tirar ``j`` de acordo com as regras.
* O sorteio usa *amostragem por rejeição*: embaralha e testa se o resultado
  respeita as regras. Isso dá exatamente a mesma chance para todo resultado
  válido. Se as regras forem muito restritivas, cai para uma busca com
  retrocesso (backtracking) em ordem aleatória, que sempre encontra uma
  solução quando ela existe.
* Antes de sortear, ``verificar`` checa se existe solução (emparelhamento
  perfeito em grafo bipartido), para nunca entrar em laço infinito.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass, field
from typing import Sequence

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TENTATIVAS_REJEICAO = 20_000


@dataclass(frozen=True)
class Participante:
    nome: str
    email: str
    grupo: str = ""  # vazio = sem grupo familiar


@dataclass(frozen=True)
class Regras:
    permitir_autossorteio: bool = False
    permitir_mesmo_grupo: bool = False
    corrente_unica: bool = False  # A→B→C→…→A, todos numa única roda


@dataclass
class Verificacao:
    viavel: bool
    erros: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


class SorteioImpossivel(ValueError):
    pass


def _grupo(p: Participante) -> str:
    return p.grupo.strip().casefold()


def pode_tirar(ps: Sequence[Participante], i: int, j: int, regras: Regras) -> bool:
    if i == j:
        return regras.permitir_autossorteio and regras.permitir_mesmo_grupo
    if regras.permitir_mesmo_grupo:
        return True
    gi, gj = _grupo(ps[i]), _grupo(ps[j])
    return not (gi and gi == gj)


def _vizinhos(ps, regras):
    n = len(ps)
    return [[j for j in range(n) if pode_tirar(ps, i, j, regras)] for i in range(n)]


def _tem_emparelhamento(viz: list[list[int]]) -> bool:
    """Algoritmo de Kuhn: existe atribuição em que todos tiram alguém diferente?"""
    n = len(viz)
    dono = [-1] * n

    def tenta(i, visto):
        for j in viz[i]:
            if not visto[j]:
                visto[j] = True
                if dono[j] == -1 or tenta(dono[j], visto):
                    dono[j] = i
                    return True
        return False

    return all(tenta(i, [False] * n) for i in range(n))


def verificar(ps: Sequence[Participante], regras: Regras, exigir_email: bool = True) -> Verificacao:
    v = Verificacao(viavel=True)
    n = len(ps)
    if n < 2:
        v.erros.append("Cadastre pelo menos 2 participantes.")
    for k, p in enumerate(ps, 1):
        if not p.nome.strip():
            v.erros.append(f"Linha {k}: nome vazio.")
        mail = p.email.strip()
        if (exigir_email or mail) and not EMAIL_RE.match(mail):
            v.erros.append(f"Linha {k} ({p.nome or '?'}): e-mail inválido.")

    vistos: dict[str, str] = {}
    for p in ps:
        e = p.email.strip().casefold()
        if not e:
            continue
        if e in vistos:
            v.avisos.append(
                f"{vistos[e]} e {p.nome} usam o mesmo e-mail — esse e-mail verá os dois resultados."
            )
        else:
            vistos[e] = p.nome

    if not v.erros:
        if not regras.permitir_mesmo_grupo:
            tamanhos: dict[str, int] = {}
            for p in ps:
                if _grupo(p):
                    tamanhos[p.grupo.strip()] = tamanhos.get(p.grupo.strip(), 0) + 1
            for g, t in tamanhos.items():
                if t > n - t:
                    v.erros.append(
                        f"O grupo '{g}' tem {t} de {n} pessoas: não há gente suficiente de fora "
                        "para todos tirarem alguém de outro grupo."
                    )
        if not v.erros and not _tem_emparelhamento(_vizinhos(ps, regras)):
            v.erros.append("Com essas regras não existe sorteio possível.")

    v.viavel = not v.erros
    return v


def _valido(ps, destino, regras) -> bool:
    return all(pode_tirar(ps, i, j, regras) for i, j in enumerate(destino))


def _eh_corrente(destino) -> bool:
    n, i, passos = len(destino), 0, 0
    while True:
        i = destino[i]
        passos += 1
        if i == 0:
            return passos == n


def _backtracking(ps, regras, rng) -> list[int] | None:
    n = len(ps)
    viz = _vizinhos(ps, regras)
    destino = [-1] * n
    usado = [False] * n

    if regras.corrente_unica:
        ordem = [0]
        usado[0] = True

        def anda(k):
            if k == n:
                return pode_tirar(ps, ordem[-1], ordem[0], regras)
            opcoes = [j for j in viz[ordem[-1]] if not usado[j]]
            rng.shuffle(opcoes)
            for j in opcoes:
                usado[j] = True
                ordem.append(j)
                if anda(k + 1):
                    return True
                ordem.pop()
                usado[j] = False
            return False

        if not anda(1):
            return None
        for a, b in zip(ordem, ordem[1:] + ordem[:1]):
            destino[a] = b
        return destino

    ordem = sorted(range(n), key=lambda i: (len(viz[i]), rng.random()))

    def atribui(k):
        if k == n:
            return True
        i = ordem[k]
        opcoes = [j for j in viz[i] if not usado[j]]
        rng.shuffle(opcoes)
        for j in opcoes:
            usado[j] = True
            destino[i] = j
            if atribui(k + 1):
                return True
            usado[j] = False
        destino[i] = -1
        return False

    return destino if atribui(0) else None


def sortear(
    ps: Sequence[Participante], regras: Regras = Regras(), rng=None, exigir_email: bool = True
) -> list[int]:
    """Devolve ``destino`` onde ``destino[i]`` é o índice de quem ``ps[i]`` tirou."""
    rng = rng or secrets.SystemRandom()
    v = verificar(ps, regras, exigir_email)
    if not v.viavel:
        raise SorteioImpossivel(" ".join(v.erros))

    n = len(ps)
    for _ in range(TENTATIVAS_REJEICAO):
        if regras.corrente_unica:
            ordem = list(range(n))
            rng.shuffle(ordem)
            destino = [0] * n
            for a, b in zip(ordem, ordem[1:] + ordem[:1]):
                destino[a] = b
        else:
            destino = list(range(n))
            rng.shuffle(destino)
        if _valido(ps, destino, regras):
            return destino

    destino = _backtracking(ps, regras, rng)
    if destino is None:
        raise SorteioImpossivel("Com essas regras não existe sorteio possível.")
    return destino
