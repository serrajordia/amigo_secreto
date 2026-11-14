# Amigo Secreto · by Mestre dos Dados

Sorteio de amigo secreto **gratuito**, sem cadastro em site nenhum, com regras de grupo familiar e envio por e-mail **pela sua própria conta Gmail**.

- 🌐 **Interface web:** https://serrajordia.github.io/amigo_secreto/ (passo a passo para o organizador)
- 🐍 **Python / notebook:** para quem prefere rodar localmente

## Como usar (interface web): dois modos

A página abre perguntando **como enviar o resultado**. O sorteio e as regras são idênticos; muda só a forma de cada pessoa descobrir quem tirou.

| | ⚡ Rápido: links | ✉️ Por e-mail: planilha Google |
|---|---|---|
| Configuração | **Nenhuma** | Fazer uma cópia da planilha modelo (1 min) + autorizar o Google uma vez |
| Como o resultado chega | Um **link secreto por pessoa** (botões de WhatsApp, e-mail, copiar, compartilhar) | **E-mail** pelo seu Gmail, automático |
| E-mail dos participantes | Opcional | Obrigatório |
| Onde funciona | Qualquer navegador, inclusive celular | Computador (o menu de script não aparece no app do celular) |
| Sigilo do organizador | Vê só a lista de nomes; o resultado só existe dentro dos links. Se abrir/decodificar o link de alguém, vê o resultado dele | O sorteio roda no Google e **nada é gravado**: nem o organizador vê |
| Esforço no envio | Um toque por pessoa | Um clique para todos |
| Custo | R$ 0 | R$ 0 (até ~100 e-mails/dia) |

### ⚡ Modo rápido
1. **Evento:** nome, data da festa, local, valor sugerido e recado (aparecem para cada pessoa).
2. **Participantes:** importe uma planilha **Excel (.xlsx/.xls) ou CSV** (colunas `nome`, `email`, `grupo`; [modelo](docs/modelo_participantes.csv); só `nome` é obrigatório) ou adicione um a um. Dá para editar clicando na tabela.
3. **Regras:** chaves liga/desliga (*ninguém tira alguém do próprio grupo*, *ninguém tira a si mesmo*, *corrente única*), com aviso na hora se o sorteio for impossível.
4. **Sortear:** gera um link por pessoa. O resultado de cada um vai **dentro do endereço, depois do `#`**, parte que nem o GitHub Pages recebe. Não existe banco de dados.
5. **Enviar:** botões por pessoa (WhatsApp, e-mail, copiar, compartilhar) e um marcador de "enviado". Os links só existem na aba aberta; **não feche a página** antes de enviar todos. Quem recebe abre o link, toca em **Revelar** e vê quem tirou, com data, local e valor.

> ⚠️ O link é *codificação*, não criptografia: quem tiver o link lê o resultado daquela pessoa. Mande cada link só ao dono, individualmente, nunca em grupo.

### ✉️ Modo e-mail (planilha Google)
1. Abra o link da planilha modelo e clique em **Fazer uma cópia** (a cópia, com o script dentro, vai para o seu Drive).
2. Preencha as abas **Participantes** e **Evento e regras**.
3. Menu **🎁 Amigo Secreto**: *Verificar* → *Enviar e-mail de teste para mim* → *Sortear e enviar e-mails*.
4. Na primeira vez o Google mostra "app não verificado" (é o seu próprio script): *Avançado → Acessar → Permitir*. O script só pode enviar e-mail e acessar aquela planilha (`@OnlyCurrentDoc`).

#### Criar o modelo (só o dono do projeto, uma vez)
1. Crie uma planilha em <https://sheets.new> e dê o nome "Amigo Secreto — modelo".
2. **Extensões → Apps Script**: cole [Planilha.gs](docs/apps-script/Planilha.gs) em `Código.gs` e crie um segundo arquivo `Sorteio.gs` com o conteúdo de [Sorteio.gs](docs/apps-script/Sorteio.gs). Salve.
3. Recarregue a planilha e use **🎁 Amigo Secreto → 1. Preparar planilha** (cria as abas). Rode *Verificar* e *Teste* para autorizar.
4. Compartilhe como **"Qualquer pessoa com o link: Leitor"**, copie o endereço e troque o final `/edit…` por `/copy`.
5. Cole esse endereço em `planilhaModeloUrl` em [docs/js/config.js](docs/js/config.js) e publique. Até lá, a página mostra o passo a passo "Monte você mesmo".

## Como usar (Python)

```bash
pip install -r requirements.txt
cp .env.example .env          # preencha GMAIL_USER e GMAIL_APP_PASSWORD (senha de app)
python -m amigo_secreto sortear participantes.csv --simular          # só verifica
python -m amigo_secreto testar-email
python -m amigo_secreto sortear participantes.csv --festa "24/12 20h" --valor "R$ 100"
```

Opções: `--permitir-mesmo-grupo`, `--permitir-autossorteio`, `--corrente`, `--evento`, `--local`, `--mensagem`, `--organizador`.
Ou abra o [notebook](Amigo%20Secreto.ipynb).

### Onde ficam as chaves

| Onde | Como | Vai para o git? |
|---|---|---|
| `.env` (Python) | `GMAIL_USER` / `GMAIL_APP_PASSWORD`, lido com `python-dotenv` | **Não** (`.gitignore`) |
| Cofre do Windows/macOS | `python -m amigo_secreto configurar` (pacote `keyring`) | Não |
| Variáveis de ambiente | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Não |
| Interface web | **Nenhuma chave.** Os dados ficam no navegador; os links ficam só na aba (sessionStorage) | Não |
| Planilha Google | Nenhuma chave: o Google autoriza o script uma vez | Não |

Para trocar a senha de app, revogue-a em <https://myaccount.google.com/apppasswords>.

## Estrutura

```
amigo_secreto/          pacote Python: sorteio.py (algoritmo), envio.py (Gmail), config.py (credenciais), cli.py
docs/                   GitHub Pages: index.html, css/marca.css, js/app.js, js/sorteio.js
docs/ver.html          página de revelação do modo rápido (js/ver.js, js/link.js)
docs/apps-script/       modo e-mail: Planilha.gs + Sorteio.gs (cópia idêntica de docs/js/sorteio.js)
tests/                  pytest (Python) e node --test (JavaScript, inclui o script da planilha com Google simulado)
```

Testes: `python -m pytest` e `node --test tests/*.test.js`.
Ao alterar `docs/js/sorteio.js`, copie para `docs/apps-script/Sorteio.gs` (um teste garante que estão iguais).

## O que mudou em relação à versão de 2021

| Antes | Agora |
|---|---|
| Senha de app escrita no notebook | `.env` / cofre do sistema / Apps Script sem senha |
| Célula de teste usava variáveis inexistentes e `except:` genérico | `testar-email` com erro claro |
| Sorteio "guloso" com `while` sem limite (podia travar para sempre) e bug que repetia o papelzinho anterior quando a urna esvaziava | Verificação prévia (emparelhamento) + amostragem por rejeição (todas as combinações válidas com a mesma chance) + backtracking como garantia |
| `random` comum, resultado visível na saída do notebook | `secrets.SystemRandom` / `crypto.getRandomValues`; resultado nunca impresso |
| E-mail em texto puro fixo | E-mail HTML com data, local, valor e recado |
| Lista de participantes no código | CSV (vírgula ou ponto e vírgula, com ou sem cabeçalho) ou cadastro na interface |

## Próximas fases (avaliação)

### Fase 2 — sorteio com código e inscrições até a data
O organizador cria o evento (data do sorteio, data da festa, valor sugerido…) e recebe um código curto (ex.: `7K3-QF`). Os participantes abrem `…/?evento=7K3-QF`, veem as informações e se inscrevem com nome, e-mail e grupo. Na data, um **gatilho de tempo do Apps Script** sorteia e envia sozinho.

- Armazenamento: uma Planilha Google na conta do organizador (gratuita).
- Necessário: confirmação de inscrição por e-mail (evita spam), editar/cancelar inscrição até a data, painel do organizador com a lista.
- Esforço estimado: médio (o algoritmo e o envio já existem; falta CRUD de inscrições + gatilho).

### Fase 3 — "quem eu tirei?" com senha
Na inscrição, o navegador do participante gera um par de chaves (WebCrypto) protegido pela senha dele (PBKDF2). No sorteio, cada resultado é **cifrado para a chave do participante**: a planilha só guarda texto cifrado e nem o organizador consegue ler. Para consultar: código do evento + e-mail + senha → decifra no navegador. "Esqueci a senha" = reenviar o resultado por e-mail.

- Esforço: médio-alto (criptografia no cliente, recuperação de senha).
- Alternativa mais simples (menos sigilo): senha guardada como hash no Apps Script e resultado em texto na planilha — o organizador conseguiria ler.

## Onde hospedar — custos por cenário

| Cenário | Componentes | Custo | Observações |
|---|---|---|---|
| **A. Recomendado (família)** | GitHub Pages + Google Apps Script + Planilha Google | **R$ 0** | Até 100 destinatários/dia (Gmail comum; 1.500 no Workspace). Cobre as fases 1, 2 e 3. Sem servidor para manter. |
| B. Seu próprio PC | Python (FastAPI/Flask) + SQLite + Cloudflare Tunnel (grátis) | R$ 0 + energia (≈ R$ 5–15/mês se ligado 24h) | O PC precisa ficar ligado até a data do sorteio; você expõe uma máquina pessoal à internet; atualizações e backup por sua conta. Faz sentido só para uso pontual ou rede local. |
| C. Serverless gratuito | Cloudflare Workers + D1 (100 mil req/dia) **ou** Supabase Free (500 MB; pausa após 7 dias sem uso) + Brevo (300 e-mails/dia) ou Resend (3.000/mês, exige domínio) | R$ 0 (+ domínio ≈ R$ 40/ano opcional) | Mais "cara de produto" (e-mail de remetente próprio, várias famílias). Exige mais contas e configuração. |
| D. Baixo custo | VPS (Hetzner/DigitalOcean ≈ US$ 4–6/mês) ou Cloudflare Workers Paid (US$ 5/mês) | ≈ R$ 25–35/mês | Controle total; você mantém sistema operacional, segurança e backups. |
| E. Escalável (público geral) | Workers/Supabase Pro (US$ 25/mês) + Amazon SES (US$ 0,10 por mil e-mails) + domínio | ≈ R$ 150+/mês | Só se virar um serviço aberto: exige LGPD (termos, exclusão de dados), anti-abuso e reputação de e-mail (SPF/DKIM/DMARC). |

**Recomendação:** ficar no cenário A. Ele atende todas as funcionalidades desejadas com custo zero e sem servidor; migrar para C só se o projeto passar a atender muitas famílias ou precisar de remetente com domínio próprio.

## Privacidade

- Os dados dos participantes ficam no navegador do organizador (localStorage, com botão para limpar). No modo e-mail passam apenas pela conta Google dele.
- Modo e-mail: nada do resultado é gravado, nem em log nem em planilha.
- Modo rápido: o resultado existe só dentro dos links (parte `#`, que não vai a servidor algum) e na aba do organizador até ele fechá-la.

## Contador de acessos (opcional)

Para saber quanta gente usa o site, o projeto tem suporte ao [GoatCounter](https://www.goatcounter.com) (gratuito, sem cookies, sem dados pessoais). Crie uma conta, copie o endereço `https://SEU-CODIGO.goatcounter.com/count` para `goatcounterUrl` em [docs/js/config.js](docs/js/config.js) e publique. Enquanto estiver vazio, nenhum contador é carregado.

São contadas as visitas e algumas ações pelo nome (`escolheu-modo-rapido`, `escolheu-modo-email`, `sorteio-rapido`, `abriu-planilha-modelo`), **nunca** nomes, e-mails ou resultados. A página de revelação (`ver.html`) **não** carrega o contador. O sorteio do modo e-mail roda no Google e não é contado.

## Licenças de terceiros

Para ler Excel, o site inclui a biblioteca [SheetJS](https://sheetjs.com) 0.20.3 (Apache-2.0) em `docs/js/vendor/`, hospedada aqui mesmo (nenhum arquivo vai a servidores externos) e carregada só quando alguém envia um .xlsx/.xls.

Contribuições são bem-vindas!
