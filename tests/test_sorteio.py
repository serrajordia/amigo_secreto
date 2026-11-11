import random
from collections import Counter
from pathlib import Path

import pytest

from amigo_secreto.cli import ler_csv
from amigo_secreto.sorteio import (
    Participante,
    Regras,
    SorteioImpossivel,
    _eh_corrente,
    pode_tirar,
    sortear,
    verificar,
)

RAIZ = Path(__file__).resolve().parents[1]


def familia():
    grupos = {"1": 5, "2": 4, "3": 4, "4": 3}  # mesmo formato do notebook original
    return [
        Participante(f"P{g}{k}", f"p{g}{k}@ex.com", g) for g, n in grupos.items() for k in range(n)
    ]


def checa(ps, destino, regras):
    assert sorted(destino) == list(range(len(ps))), "cada um é tirado exatamente uma vez"
    for i, j in enumerate(destino):
        assert pode_tirar(ps, i, j, regras)


@pytest.mark.parametrize(
    "regras",
    [
        Regras(),
        Regras(permitir_mesmo_grupo=True),
        Regras(permitir_mesmo_grupo=True, permitir_autossorteio=True),
        Regras(corrente_unica=True),
        Regras(permitir_mesmo_grupo=True, corrente_unica=True),
    ],
)
def test_regras_sempre_respeitadas(regras):
    ps = familia()
    rng = random.Random(42)
    for _ in range(2000):
        d = sortear(ps, regras, rng)
        checa(ps, d, regras)
        if regras.corrente_unica:
            assert _eh_corrente(d)


def test_ninguem_tira_a_si_mesmo_por_padrao():
    ps = [Participante(n, f"{n}@ex.com") for n in "abc"]
    for _ in range(500):
        d = sortear(ps)
        assert all(i != j for i, j in enumerate(d))


def test_grupo_grande_demais_e_impossivel():
    ps = [Participante(f"x{k}", f"x{k}@ex.com", "A") for k in range(4)]
    ps.append(Participante("y", "y@ex.com", "B"))
    v = verificar(ps, Regras())
    assert not v.viavel and "'A'" in v.erros[0]
    with pytest.raises(SorteioImpossivel):
        sortear(ps)


def test_grupo_exatamente_metade_e_viavel():
    ps = [Participante(f"x{k}", f"x{k}@ex.com", "A" if k < 3 else "B") for k in range(6)]
    checa(ps, sortear(ps), Regras())


def test_validacoes():
    v = verificar([Participante("a", "invalido"), Participante("", "b@ex.com")], Regras())
    assert not v.viavel and len(v.erros) == 2
    assert not verificar([Participante("a", "a@ex.com")], Regras()).viavel


def test_email_repetido_gera_aviso_mas_permite():
    ps = [Participante("a", "x@ex.com"), Participante("b", "x@ex.com"), Participante("c", "c@ex.com")]
    v = verificar(ps, Regras())
    assert v.viavel and v.avisos


def test_distribuicao_aproximadamente_uniforme():
    ps = familia()
    rng = random.Random(7)
    cont = Counter()
    rodadas = 6000
    for _ in range(rodadas):
        cont[sortear(ps, Regras(), rng)[0]] += 1
    # P10 (grupo 1, 5 pessoas) pode tirar qualquer um dos 11 de fora
    assert len(cont) == 11
    esperado = rodadas / 11
    assert all(abs(c - esperado) < esperado * 0.2 for c in cont.values())


def test_backtracking_quando_rejeicao_falha(monkeypatch):
    import amigo_secreto.sorteio as s

    monkeypatch.setattr(s, "TENTATIVAS_REJEICAO", 0)
    ps = familia()
    for regras in (Regras(), Regras(corrente_unica=True)):
        d = sortear(ps, regras, random.Random(1))
        checa(ps, d, regras)


def test_ler_csv_modelo_e_variacoes(tmp_path):
    ps = ler_csv(RAIZ / "docs" / "modelo_participantes.csv")
    assert len(ps) == 6 and ps[0] == Participante("Ana", "ana@exemplo.com", "Família Silva")

    f = tmp_path / "x.csv"
    f.write_text("E-mail,Família,Nome\nz@ex.com,G1,Zé\n", encoding="utf-8-sig")
    assert ler_csv(f) == [Participante("Zé", "z@ex.com", "G1")]

    f.write_text("Zé;z@ex.com\n\nLu;l@ex.com;G2\n", encoding="utf-8")
    assert ler_csv(f) == [Participante("Zé", "z@ex.com", ""), Participante("Lu", "l@ex.com", "G2")]


def test_js_e_apps_script_usam_o_mesmo_algoritmo():
    web = (RAIZ / "docs" / "js" / "sorteio.js").read_text(encoding="utf-8")
    gs = (RAIZ / "docs" / "apps-script" / "Sorteio.gs").read_text(encoding="utf-8")
    assert web == gs, "rode: cp docs/js/sorteio.js docs/apps-script/Sorteio.gs"


def test_email_escapa_html_e_inclui_evento():
    from amigo_secreto.envio import Evento, montar_mensagem

    msg = montar_mensagem(
        "org@ex.com",
        Participante("<Ana>", "ana@ex.com"),
        Participante("Bruno & Cia", "b@ex.com"),
        Evento(nome="Natal", data_festa="24/12", valor_sugerido="R$ 100"),
    )
    html = msg.get_body("html").get_content()
    assert "&lt;Ana&gt;" in html and "Bruno &amp; Cia" in html and "R$ 100" in html
    assert "Bruno & Cia" in msg.get_body("plain").get_content()


def test_credenciais_nao_vazam_no_repr():
    from amigo_secreto.config import Credenciais

    assert "segredo" not in repr(Credenciais("a@ex.com", "segredo"))


def test_email_opcional_mas_validado_quando_presente():
    ps = [Participante("a", ""), Participante("b", ""), Participante("c", "")]
    assert not verificar(ps, Regras()).viavel
    assert verificar(ps, Regras(), exigir_email=False).viavel
    assert len(sortear(ps, exigir_email=False)) == 3
    ruins = [Participante("a", "xx"), Participante("b", ""), Participante("c", "")]
    assert not verificar(ruins, Regras(), exigir_email=False).viavel
