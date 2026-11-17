# ⚔️ Crônicas de Sangue & Glória (PBBG Tactical RPG)

Um RPG tático de navegador inspirado no estilo clássico de jogos como **Gladiatus** e **BiteFight**, enriquecido com mecânicas modernas de **Grid Tático (estilo Roll20 / VTT)** e gerenciamento de recursos vitais profundos.

---

## 🌟 Visão Geral do Jogo

O jogo combina o charme e a progressão viciante dos clássicos jogos persistentes de navegador dos anos 2000 com um sistema de combate tático por turnos em grid quadriculado.

### 🎮 Características Principais

- **Sistema de Recursos Vitais Triplo:**
  - **Vida (HP):** Determina a sobrevivência do personagem. Aumentada em **+4 por ponto em Constituição**.
  - **Mana (MP):** Combustível para habilidades arcanas e feitiços. Aumentada em **+4 por ponto em Inteligência**.
  - **Energia (EP):** Barra fixa em **100 pontos** usada para golpes físicos e ações corporais. Possui **regeneração passiva de +20 EP por rodada automaticamente**.

- **Atributos d20 Clássicos (Iniciam em 0):**
  - **Força:** Aumenta a capacidade de carga ($10\text{kg} + \text{Força} \times 5$) e o dano de golpes físicos.
  - **Constituição:** Eleva a Vida máxima e a resiliência física.
  - **Destreza:** Define o acesso a manobras refinadas e é a base da **Iniciativa** no combate.
  - **Inteligência:** Eleva a Mana máxima e o poder mágico.
  - **Carisma:** Mede a influência social, barganha e descontos em mercadores.
  - **Sabedoria:** Amplifica poderes divinos, curas e percepção de perigos.

- **Raça & Habilidades Inatas:**
  - **Humano:** Passiva *Ambição* — Inicia no nível 1 com 1 slot de habilidade inata adicional para customização.
  - **Habilidade Inata (Força Aprimorada):** Concede **+2 de Força** permanente ao personagem.

- **Sistema Tático em Grid (Roll20 / VTT Style):**
  - **Escala:** Cada quadrado do grid equivale a **1,5 metros**.
  - **Deslocamento:** Cada combatente pode se mover até **9 metros (6 quadrados)** por turno.
  - **Prévia de Movimento (Pathfinding):** Destaque visual da área alcançável no grid, contornando obstáculos de pedra.
  - **Economia de Ações por Turno:** **1 Movimento** e **1 Ação** (atacar/defender) por turno.
  - **Rolagem de Iniciativa:** Rolagem de dado ($d20 + \text{Destreza}$) com anúncio animado de início de combate.

---

## 📁 Estrutura de Arquivos

```text
rpg-browser-game/
├── index.html       # Estrutura visual, ficha de herói, modal de arena e grid tático
├── game.js          # Motor matemático de atributos, pathfinding e loop de combate
├── style.css        # Tema dark fantasy, efeitos de borda metálica e tokens Roll20
└── README.md        # Documentação completa do projeto
```

---

## 🚀 Como Executar

Este projeto foi construído para rodar de maneira **100% nativa e instantânea no navegador**, sem necessidade de compilação ou dependências externas pesadas:

1. Clone o repositório ou baixe os arquivos.
2. Dê dois cliques no arquivo `index.html` para abrir diretamente no seu navegador padrão (Google Chrome, Edge, Firefox, Brave, etc.).
3. Distribua seus 15 pontos livres na ficha e clique em **"Testar em Combate (Arena)"**!

---

## 📜 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.
