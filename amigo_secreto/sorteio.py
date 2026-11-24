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

import hashlib
import re
import secrets
import unicodedata
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


def _emparelhar(viz: list[list[int]], rng=None) -> list[int] | None:
    """Algoritmo de Kuhn (iterativo, sem recursão): atribui a cada pessoa um destino permitido.

    Devolve ``destino`` (``destino[i]`` = quem ``i`` tirou) ou ``None`` se não existe atribuição
    completa. Com ``rng``, a ordem das pessoas e das opções é embaralhada, o que dá um sorteio
    válido e imprevisível (aproximadamente uniforme; só a amostragem por rejeição é exata).
    """
    n = len(viz)
    viz = [list(v) for v in viz]
    ordem = list(range(n))
    if rng is not None:
        rng.shuffle(ordem)
        for v in viz:
            rng.shuffle(v)
    dono = [-1] * n  # dono[j] = quem tirou j
    for inicio in ordem:
        visto = [False] * n
        pilha, pos, escolhas = [inicio], [0], []
        achou = False
        while pilha:
            i, k = pilha[-1], len(pilha) - 1
            if pos[k] < len(viz[i]):
                j = viz[i][pos[k]]
                pos[k] += 1
                if visto[j]:
                    continue
                visto[j] = True
                escolhas.append(j)
                if dono[j] == -1:
                    achou = True
                    break
                pilha.append(dono[j])  # tenta fazer o atual dono de j trocar de destino
                pos.append(0)
            else:
                pilha.pop()
                pos.pop()
                if escolhas:
                    escolhas.pop()
        if not achou:
            return None
        for pessoa, j in zip(pilha, escolhas):  # aplica a cadeia de trocas
            dono[j] = pessoa
    destino = [0] * n
    for j, i in enumerate(dono):
        destino[i] = j
    return destino


def _tem_emparelhamento(viz: list[list[int]]) -> bool:
    """Existe atribuição em que todos tiram alguém permitido?"""
    return _emparelhar(viz) is not None


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
    """Busca com retrocesso, usada só para 'corrente única' (um único ciclo), que o Kuhn não garante."""
    n = len(ps)
    viz = _vizinhos(ps, regras)
    usado = [False] * n
    usado[0] = True
    ordem = [0]

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

    try:
        if not anda(1):
            return None
    except RecursionError:
        raise SorteioImpossivel("Lista grande demais para a regra 'corrente única' com estes grupos.")
    destino = [-1] * n
    for a, b in zip(ordem, ordem[1:] + ordem[:1]):
        destino[a] = b
    return destino


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

    # Rede de segurança (casos apertados, ex.: poucos grupos enormes): sorteio válido em tempo polinomial.
    if regras.corrente_unica:
        destino = _backtracking(ps, regras, rng)
    else:
        destino = _emparelhar(_vizinhos(ps, regras), rng)
    if destino is None:
        raise SorteioImpossivel("Com essas regras não existe sorteio possível.")
    return destino


# ---------------------------------------------------------------------------------------------
# Sorteio reprodutível ("código de recuperação"), versão 1 — mesma lógica de docs/js/sorteio.js.
#
# Código: 1-SSSS-SSSS-SSSS-SSSS-CCCC
#   1     versão (o algoritmo da v1 fica congelado; mudanças futuras viram v2)
#   S×16  segredo aleatório (80 bits, alfabeto Crockford base32)
#   C×4   conferência = hash(segredo + lista + regras): pega erro de digitação e lista alterada
# Números aleatórios: SHA-256("amigo-secreto/v1/<segredo>/<contador>"), 8 palavras de 32 bits por bloco.
# Com o mesmo código e a mesma lista (mesma ordem, grupos e regras), o resultado é idêntico no
# navegador, no Apps Script e aqui. Quem tem o código E a lista consegue refazer o sorteio inteiro.
# ---------------------------------------------------------------------------------------------

ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_CODIGO_RE = re.compile(r"^1[0-9A-HJKMNP-TV-Z]{20}$")


class CodigoInvalido(ValueError):
    pass


def _hash(txt: str) -> bytes:
    return hashlib.sha256(txt.encode("utf-8")).digest()


def _base32(h: bytes, n: int) -> str:
    v = int.from_bytes(h, "big")
    total = len(h) * 8
    return "".join(ALFABETO[(v >> (total - 5 * (i + 1))) & 31] for i in range(n))


def _canonico(s: str) -> str:
    s = re.sub("[\u0300-\u036f]", "", unicodedata.normalize("NFKD", s or ""))
    return re.sub(r"\s+", " ", s.lower()).strip()


def _conferencia(segredo: str, ps: Sequence[Participante], regras: Regras) -> str:
    bits = "".join(
        "1" if b else "0"
        for b in (
            regras.permitir_autossorteio and regras.permitir_mesmo_grupo,
            regras.permitir_mesmo_grupo,
            regras.corrente_unica,
        )
    )
    lista = "\u001e".join(_canonico(p.nome) + "\u001f" + p.grupo.strip().lower() for p in ps)
    return _base32(_hash(f"amigo-secreto/v1/conferencia/{segredo}|{bits}|{lista}"), 4)


def _formata(c: str) -> str:
    return c[0] + "-" + "-".join(c[k : k + 4] for k in range(1, 21, 4))


def _normaliza_codigo(codigo: str) -> str:
    c = re.sub(r"[\s\-–—.]", "", str(codigo or "").upper())
    return c.replace("O", "0").replace("I", "1").replace("L", "1").replace("U", "V")


class GeradorReprodutivel:
    """Gerador determinístico (SHA-256 em modo contador) com ``random()`` e ``shuffle()``
    idênticos aos da versão JavaScript (Fisher-Yates com ``floor(random() * (i + 1))``)."""

    def __init__(self, segredo: str):
        self._segredo = segredo
        self._contador = 0
        self._palavras: list[int] = []

    def random(self) -> float:
        if not self._palavras:
            h = _hash(f"amigo-secreto/v1/{self._segredo}/{self._contador}")
            self._contador += 1
            self._palavras = [int.from_bytes(h[k : k + 4], "big") for k in range(28, -1, -4)]
        return self._palavras.pop() / 4294967296

    def shuffle(self, v: list) -> None:
        for i in range(len(v) - 1, 0, -1):
            j = int(self.random() * (i + 1))
            v[i], v[j] = v[j], v[i]


@dataclass(frozen=True)
class CodigoLido:
    codigo: str
    apelido: str  # curto e público (vai no e-mail/link): distingue um sorteio do outro
    segredo: str

    def gerador(self) -> GeradorReprodutivel:
        return GeradorReprodutivel(self.segredo)


def novo_codigo(ps: Sequence[Participante], regras: Regras = Regras()) -> str:
    segredo = "".join(secrets.choice(ALFABETO) for _ in range(16))
    return _formata("1" + segredo + _conferencia(segredo, ps, regras))


def ler_codigo(codigo: str, ps: Sequence[Participante], regras: Regras = Regras()) -> CodigoLido:
    """Confere o código com a lista e as regras. Lança ``CodigoInvalido`` se não conferir."""
    c = _normaliza_codigo(codigo)
    if not _CODIGO_RE.match(c):
        raise CodigoInvalido("Código incompleto ou inválido. O formato é 1-XXXX-XXXX-XXXX-XXXX-XXXX.")
    segredo = c[1:17]
    if c[17:] != _conferencia(segredo, ps, regras):
        raise CodigoInvalido(
            "Este código não confere com a lista atual. Confira se o código foi digitado certo e se os "
            "participantes (na mesma ordem), os grupos e as regras estão exatamente como no dia do sorteio."
        )
    return CodigoLido(_formata(c), _base32(_hash(f"amigo-secreto/v1/apelido/{segredo}"), 4), segredo)
