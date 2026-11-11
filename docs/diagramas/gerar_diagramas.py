"""Gera os diagramas SVG de docs/diagramas.

Os arquivos .mmd continuam sendo a referência textual de cada diagrama; este
script define o layout final (posições, portas de conexão e rotas ortogonais)
para que as setas não se sobreponham nem fiquem coladas umas nas outras.

Uso:  python docs/diagramas/gerar_diagramas.py
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent
FONT = "Arial, Helvetica, sans-serif"
EDGE = "#667b86"
LABEL = "#3d525d"
TEXT = "#243b49"
TITLE = "#172b3a"

STYLES = {
    "actor": ("#f0f7ff", "#3776ab"),
    "system": ("#eaf3fb", "#3973a8"),
    "external": ("#fff7e8", "#c78624"),
    "data": ("#eaf6ef", "#45845f"),
    "service": ("#f2efff", "#7761b1"),
    "ui": ("#eef2ff", "#6376b5"),
    "start": ("#e7f5f3", "#328c83"),
    "end": ("#e8f7f0", "#3b8b68"),
    "error": ("#fff0ee", "#c95d4e"),
    "entity": ("#edf4ff", "#4971a7"),
}


def text_width(text: str, size: float = 12, bold: bool = False) -> float:
    """Estimativa simples da largura do texto em Arial."""
    return len(text) * size * (0.58 if bold else 0.53)


@dataclass
class Node:
    x: float
    y: float
    w: float
    h: float
    shape: str = "rect"

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2


class Diagram:
    def __init__(self, name: str, title: str, desc: str, width: int, height: int):
        self.name, self.title, self.desc = name, title, desc
        self.width, self.height = width, height
        self.nodes: dict[str, Node] = {}
        self.back: list[str] = []
        self.edges: list[str] = []
        self.shapes: list[str] = []
        self.labels: list[str] = []

    # ---------- nós ----------
    def node(self, key, x, y, w, h, lines, style, shape="rect"):
        fill, stroke = STYLES[style]
        self.nodes[key] = Node(x, y, w, h, shape)
        if shape == "ellipse":
            self.shapes.append(
                f'<ellipse cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
            )
        else:
            rx = h / 2 if shape == "pill" else 12
            self.shapes.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
            )
        self._lines(x + w / 2, y + h / 2, lines)

    def _lines(self, cx, cy, lines, size=14):
        step = size + 5
        first = cy - (len(lines) - 1) * step / 2 + size * 0.35
        for i, line in enumerate(lines):
            weight = 700 if i == 0 else 400
            self.shapes.append(
                f'<text x="{cx}" y="{first + i * step:.1f}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                f'fill="{TEXT}">{escape(line)}</text>'
            )

    def actor_icon(self, cx, top, color="#3776ab"):
        """Bonequinho simples para atores de casos de uso."""
        self.shapes.append(
            f'<g fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round">'
            f'<circle cx="{cx}" cy="{top + 10}" r="10"/>'
            f'<path d="M {cx} {top + 20} V {top + 46} M {cx - 18} {top + 30} H {cx + 18} '
            f'M {cx} {top + 46} L {cx - 14} {top + 66} M {cx} {top + 46} L {cx + 14} {top + 66}"/>'
            f"</g>"
        )

    def boundary(self, x, y, w, h, label):
        self.back.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="#fafcfe" '
            f'stroke="#9aaab4" stroke-width="1.5" stroke-dasharray="7 6"/>'
        )
        self.back.append(
            f'<text x="{x + 18}" y="{y + h - 16}" font-family="{FONT}" font-size="13" '
            f'font-weight="700" fill="#6b7f8a">{escape(label)}</text>'
        )

    # ---------- portas ----------
    def p(self, key, side, t=0.5):
        """Ponto na borda do nó. t vai de 0 a 1 ao longo do lado."""
        n = self.nodes[key]
        if n.shape == "ellipse" and side in ("left", "right") and t == 0.5:
            return (n.x if side == "left" else n.x + n.w, n.cy)
        if side == "left":
            return (n.x, n.y + n.h * t)
        if side == "right":
            return (n.x + n.w, n.y + n.h * t)
        if side == "top":
            return (n.x + n.w * t, n.y)
        return (n.x + n.w * t, n.y + n.h)

    # ---------- arestas ----------
    def edge(self, pts, label=None, lseg=0, lpos=None, anchor="middle",
             arrow=True, dashed=False, marker_start=None, marker_end=None):
        pts = [(float(x), float(y)) for x, y in pts]
        d = _rounded_path(pts, 12)
        end = marker_end or ("arrow" if arrow else None)
        attrs = [f'd="{d}"', 'fill="none"', f'stroke="{EDGE}"', 'stroke-width="2"',
                 'stroke-linejoin="round"']
        if dashed:
            attrs.append('stroke-dasharray="6 5"')
        if end:
            attrs.append(f'marker-end="url(#{end})"')
        if marker_start:
            attrs.append(f'marker-start="url(#{marker_start})"')
        self.edges.append(f"<path {' '.join(attrs)}/>")
        if label:
            if lpos is None:
                if lseg < 0:
                    (x1, y1), (x2, y2) = pts[lseg - 1], pts[lseg]
                else:
                    (x1, y1), (x2, y2) = pts[lseg], pts[lseg + 1]
                lpos = ((x1 + x2) / 2, (y1 + y2) / 2)
            self.label(lpos[0], lpos[1], label, anchor)

    def label(self, x, y, text, anchor="middle"):
        self.labels.append(
            f'<text x="{x}" y="{y + 4}" text-anchor="{anchor}" font-family="{FONT}" '
            f'font-size="12.5" fill="{LABEL}" paint-order="stroke" stroke="#ffffff" '
            f'stroke-width="8" stroke-linejoin="round">{escape(text)}</text>'
        )

    def free_text(self, x, y, text, size=12, anchor="middle", color="#6b7f8a", italic=False):
        style = ' font-style="italic"' if italic else ""
        self.shapes.append(
            f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONT}" '
            f'font-size="{size}"{style} fill="{color}">{escape(text)}</text>'
        )

    def raw(self, svg: str):
        self.shapes.append(svg)

    # ---------- saída ----------
    def save(self):
        defs = (
            "<defs>"
            f'<marker id="arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" '
            f'markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">'
            f'<path d="M 0 0.5 L 12 6 L 0 11.5 z" fill="{EDGE}"/></marker>'
            f'<marker id="er-one" viewBox="0 0 20 20" refX="0" refY="10" markerWidth="20" '
            f'markerHeight="20" markerUnits="userSpaceOnUse" orient="auto">'
            f'<path d="M 8 2 V 18 M 13 2 V 18" stroke="{EDGE}" stroke-width="2" fill="none"/></marker>'
            f'<marker id="er-many" viewBox="0 0 20 20" refX="20" refY="10" markerWidth="20" '
            f'markerHeight="20" markerUnits="userSpaceOnUse" orient="auto">'
            f'<path d="M 4 10 L 20 2 M 4 10 L 20 18 M 4 10 H 20 M 3 2 V 18" stroke="{EDGE}" '
            f'stroke-width="2" fill="none"/></marker>'
            "</defs>"
        )
        parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" '
            f'viewBox="0 0 {self.width} {self.height}" role="img" aria-labelledby="title desc">',
            f'<title id="title">{escape(self.title)}</title>',
            f'<desc id="desc">{escape(self.desc)}</desc>',
            defs,
            '<rect width="100%" height="100%" fill="#ffffff"/>',
            f'<text x="40" y="48" font-family="{FONT}" font-size="24" font-weight="700" '
            f'fill="{TITLE}">{escape(self.title)}</text>',
            *self.back, *self.edges, *self.shapes, *self.labels,
            "</svg>",
        ]
        (OUT_DIR / f"{self.name}.svg").write_text("\n".join(parts) + "\n", encoding="utf-8")


def _rounded_path(pts, radius):
    """Polilinha com cantos arredondados."""
    if len(pts) == 2:
        (x1, y1), (x2, y2) = pts
        return f"M {x1:g} {y1:g} L {x2:g} {y2:g}"
    out = [f"M {pts[0][0]:g} {pts[0][1]:g}"]
    for i in range(1, len(pts) - 1):
        (xa, ya), (xb, yb), (xc, yc) = pts[i - 1], pts[i], pts[i + 1]
        la = ((xb - xa) ** 2 + (yb - ya) ** 2) ** 0.5
        lc = ((xc - xb) ** 2 + (yc - yb) ** 2) ** 0.5
        r = min(radius, la / 2, lc / 2)
        p1 = (xb - (xb - xa) / la * r, yb - (yb - ya) / la * r)
        p2 = (xb + (xc - xb) / lc * r, yb + (yc - yb) / lc * r)
        out.append(f"L {p1[0]:g} {p1[1]:g} Q {xb:g} {yb:g} {p2[0]:g} {p2[1]:g}")
    out.append(f"L {pts[-1][0]:g} {pts[-1][1]:g}")
    return " ".join(out)


# =====================================================================
# Diagramas
# =====================================================================

def casos_de_uso():
    d = Diagram("casos-de-uso", "HitTrack | Casos de uso",
                "Ator Analista/equipe ligado aos cinco casos de uso; sistemas externos "
                "alimentam análise, ranking e monitoramento.", 1220, 940)
    d.boundary(410, 90, 400, 680, "Sistema HitTrack")
    ys = [150, 280, 410, 540, 670]
    ucs = [
        ("create", ["UC-01", "Registrar luta e", "importar hits"]),
        ("analyze", ["UC-02", "Analisar vídeo e", "calcular métricas"]),
        ("dashboard", ["UC-03", "Consultar dashboard", "e histórico"]),
        ("ranking", ["UC-04", "Consultar ranking"]),
        ("monitor", ["UC-05", "Monitorar API"]),
    ]
    for (key, lines), cy in zip(ucs, ys):
        d.node(key, 480, cy - 45, 260, 90, lines, "actor", "ellipse")

    # ator: coluna alta, cada caso de uso recebe uma linha reta própria
    d.nodes["analyst"] = Node(50, 105, 200, 610)
    fill, stroke = STYLES["actor"]
    d.raw(f'<rect x="50" y="105" width="200" height="610" rx="14" fill="{fill}" '
          f'stroke="{stroke}" stroke-width="2"/>')
    d.actor_icon(150, 345)
    d.raw(f'<text x="150" y="440" text-anchor="middle" font-family="{FONT}" font-size="15" '
          f'font-weight="700" fill="{TEXT}">Analista/equipe</text>')

    for key, cy, lbl in zip(["create", "analyze", "dashboard", "ranking", "monitor"], ys,
                            ["cadastra", "inicia", "consulta", "seleciona categoria", "acompanha"]):
        d.edge([(250, cy), d.p(key, "left")], lbl, lpos=(345, cy))

    d.node("detector", 930, 240, 240, 80, ["Detector externo", "hitcount-ia"], "external")
    d.node("robocore", 930, 500, 240, 80, ["Fonte de ranking", "RoboCore"], "external")
    d.node("prometheus", 930, 630, 240, 80, ["Prometheus", "coleta /metrics"], "external")
    d.node("grafana", 930, 810, 240, 80, ["Grafana", "exibe indicadores"], "external")
    d.edge([d.p("detector", "left"), d.p("analyze", "right")], "eventos de vídeo", lpos=(870, 280))
    d.edge([d.p("robocore", "left"), d.p("ranking", "right")], "dados publicados", lpos=(870, 540))
    d.edge([d.p("prometheus", "left"), d.p("monitor", "right")], "scrape /metrics", lpos=(870, 670))
    d.edge([d.p("grafana", "top"), d.p("prometheus", "bottom")], "consulta")
    d.save()


def atividade(name, title, desc, steps, branch, branch_label, main_label, styles):
    """Fluxo vertical com uma ramificação lateral a partir do 3º/2º passo."""
    x, w, h, step = 130, 300, 76, 140
    top = 90
    height = top + (len(steps) - 1) * step + h + 50
    d = Diagram(name, title, desc, 1000, height)
    for i, (key, lines) in enumerate(steps):
        shape = "pill" if i in (0, len(steps) - 1) else "rect"
        d.node(key, x, top + i * step, w, h, lines, styles[i], shape)
    for i in range(len(steps) - 1):
        a, b = steps[i][0], steps[i + 1][0]
        lbl = main_label if a == branch[0] else None
        d.edge([d.p(a, "bottom"), d.p(b, "top")], lbl)
    src, (key, lines, style) = branch[0], branch[1]
    sy = d.nodes[src].y
    d.node(key, 570, sy, 300, h, lines, style)
    d.edge([d.p(src, "right"), d.p(key, "left")], branch_label)
    d.save()


def atividades():
    atividade(
        "atividade-01-ingestao", "Fluxo 1 | Registrar luta e importar hits",
        "Cadastro da luta, validação pela API e envio de vídeo ou eventos JSON.",
        [("start", ["Analista inicia cadastro"]),
         ("form", ["Informa competição, categoria,", "robôs, equipes, duração e FPS"]),
         ("validate", ["API valida os dados", "e salva a luta"]),
         ("input", ["Envia vídeo ou eventos JSON"]),
         ("stored", ["Valida tipo/robôs, remove duplicatas", "e associa dados à luta"]),
         ("done", ["Luta e dados disponíveis", "para consulta"])],
        ("validate", ("error", ["Retorna erro de validação", "sem aceitar o payload"], "error")),
        "inválidos", "dados válidos",
        ["start", "service", "service", "service", "service", "end"],
    )
    atividade(
        "atividade-02-analise", "Fluxo 2 | Analisar vídeo e calcular métricas",
        "Verificação de pré-requisitos, processamento pelo worker e cálculo de métricas.",
        [("start", ["Analista solicita análise"]),
         ("check", ["API verifica luta, vídeo", "e detector configurado"]),
         ("worker", ["Worker processa vídeo", "e identifica eventos"]),
         ("persist", ["Persiste hits não duplicados", "associados à luta"]),
         ("calc", ["Agrupa hits por robô e período;", "calcula métricas"]),
         ("finish", ["Encerra luta e disponibiliza", "resultado/análise"])],
        ("check", ("missing", ["Informa vídeo ausente", "ou dependência indisponível"], "error")),
        "falha", "pré-requisitos atendidos",
        ["start", "service", "external", "service", "service", "end"],
    )

    # Fluxo 3 termina em duas ramificações abaixo do último passo
    d = Diagram("atividade-03-dashboard", "Fluxo 3 | Consultar dashboard e histórico",
                "Consulta de dados pelo frontend e exibição conforme o status da luta.", 800, 950)
    x, w, h, step, top = 250, 300, 76, 140, 90
    steps = [("open", ["Analista abre uma tela", "ou seleciona filtros"], "start"),
             ("request", ["Frontend solicita luta,", "histórico ou agregados"], "service"),
             ("query", ["API consulta e filtra", "dados persistidos"], "service"),
             ("metrics", ["Calcula comparações,", "linhas do tempo e cobertura"], "service"),
             ("render", ["Frontend exibe gráficos,", "tabelas e histórico"], "service")]
    for i, (key, lines, style) in enumerate(steps):
        d.node(key, x, top + i * step, w, h, lines, style, "pill" if i == 0 else "rect")
    for i in range(len(steps) - 1):
        d.edge([d.p(steps[i][0], "bottom"), d.p(steps[i + 1][0], "top")])
    d.node("closed", 50, 820, 300, h, ["Luta encerrada:", "mostra sugestões pós-luta"], "end", "pill")
    d.node("live", 450, 820, 300, h, ["Luta em andamento:", "mostra estado sem sugestões"],
           "external", "pill")
    by = d.nodes["render"].y + h
    d.edge([d.p("render", "bottom", 0.3), (340, by + 50), (200, by + 50), d.p("closed", "top")],
           "encerrada", lpos=(255, by + 50))
    d.edge([d.p("render", "bottom", 0.7), (460, by + 50), (600, by + 50), d.p("live", "top")],
           "em andamento", lpos=(545, by + 50))
    d.save()


def navegacao():
    d = Diagram("navegacao", "HitTrack | Estrutura de navegação",
                "SPA com sete telas acessíveis a partir do menu principal.", 1260, 400)
    d.node("app", 470, 85, 320, 64, ["Aplicação HitTrack (SPA)", "menu principal"], "start")
    pages = ["Início", "Nova luta", "Ao vivo", "Análise", "Desempenho", "Ranking", "Histórico"]
    w, gap = 140, 26
    x0 = (1260 - (len(pages) * w + (len(pages) - 1) * gap)) / 2
    bus = 215
    centers = [x0 + i * (w + gap) + w / 2 for i in range(len(pages))]
    d.edge([d.p("app", "bottom"), (630, bus)], arrow=False)
    d.edge([(centers[0], bus), (centers[-1], bus)], arrow=False)
    for i, (page, cx) in enumerate(zip(pages, centers)):
        key = f"p{i}"
        d.node(key, cx - w / 2, 285, w, 64, [page], "ui")
        d.edge([(cx, bus), d.p(key, "top")])
    d.save()


def c4_contexto():
    d = Diagram("c4-contexto", "C4 | Contexto do sistema",
                "HitTrack ao centro, com o analista e os sistemas externos ao redor.", 1300, 880)
    d.node("analyst", 60, 330, 240, 90, ["Analista/equipe", "registra e consulta lutas"], "actor")
    d.node("hittrack", 460, 300, 260, 150, ["HitTrack", "lutas, hits, métricas", "e dashboards"],
           "system")
    d.node("detector", 1000, 120, 240, 90, ["hitcount-ia", "análise de vídeo externa"], "external")
    d.node("robo", 1000, 330, 240, 90, ["RoboCore", "fonte externa do ranking"], "external")
    d.node("prom", 1000, 540, 240, 90, ["Prometheus", "scrape de /metrics"], "external")
    d.node("grafana", 1000, 740, 240, 90, ["Grafana", "dashboard operacional"], "external")
    d.edge([d.p("analyst", "right"), d.p("hittrack", "left")], "HTTPS/REST")
    d.edge([d.p("detector", "left"), (840, 165), (840, 335), (720, 335)], "eventos de análise",
           lpos=(920, 165))
    d.edge([d.p("robo", "left"), d.p("hittrack", "right")], "snapshot por categoria",
           lpos=(920, 375))
    d.edge([d.p("prom", "left"), (840, 585), (840, 415), (720, 415)], "HTTP /metrics",
           lpos=(920, 585))
    d.edge([d.p("grafana", "top"), d.p("prom", "bottom")], "consulta PromQL")
    d.save()


def c4_containers():
    d = Diagram("c4-containers", "C4 | Contêineres do HitTrack",
                "Frontend, API, banco e armazenamento dentro do sistema; detector, ranking "
                "e observabilidade como externos.", 1310, 720)
    d.boundary(320, 250, 610, 420, "Sistema HitTrack")
    d.node("analyst", 40, 300, 210, 90, ["Analista", "navegador"], "actor")
    d.node("frontend", 350, 300, 220, 90, ["Frontend", "React + Vite"], "system")
    d.node("api", 670, 280, 220, 130, ["API", "FastAPI + Python"], "system")
    d.node("db", 670, 530, 220, 90, ["Banco de dados", "PostgreSQL"], "data")
    d.node("storage", 350, 530, 220, 90, ["Vídeos", "sistema de arquivos local"], "data")
    d.node("detector", 1050, 100, 220, 90, ["Detector", "hitcount-ia externo"], "external")
    d.node("ranking", 1050, 300, 220, 90, ["Ranking", "RoboCore externo"], "external")
    d.node("monitor", 1050, 500, 220, 90, ["Prometheus + Grafana", "observabilidade local"],
           "external")
    d.edge([d.p("analyst", "right"), d.p("frontend", "left")], "usa")
    d.edge([d.p("frontend", "right"), (670, 345)], "HTTP/JSON")
    d.edge([(820, 410), (820, 530)], "SQLAlchemy")
    d.edge([(720, 410), (720, 465), (460, 465), (460, 530)], "arquivos", lseg=1)
    d.edge([(890, 305), (960, 305), (960, 145), (1050, 145)], "worker/pesos", lseg=1)
    d.edge([d.p("ranking", "left"), (890, 345)], "HTTP", lpos=(1005, 345))
    d.edge([d.p("monitor", "left"), (960, 545), (960, 385), (890, 385)], "scrape /metrics",
           lseg=1)
    d.save()


def c4_componentes():
    d = Diagram("c4-componentes", "C4 | Componentes da API",
                "Rotas, serviços e persistência da API FastAPI e suas integrações.", 1080, 880)
    d.boundary(340, 215, 700, 495, "API FastAPI")
    d.node("frontend", 40, 375, 200, 160, ["Frontend", "React + Vite"], "system")
    d.node("detector", 380, 80, 240, 90, ["Detector externo", "hitcount-ia"], "external")
    d.node("fights", 380, 250, 240, 90, ["Rotas de lutas", "cadastro, vídeo e hits"], "system")
    d.node("analytics", 380, 410, 240, 90, ["Rotas/serviço analítico", "filtros e agregações"],
           "system")
    d.node("ranking", 380, 570, 240, 90, ["Rotas/importador ranking", "snapshot RoboCore"],
           "system")
    d.node("robo", 380, 760, 240, 90, ["RoboCore", "fonte do ranking"], "external")
    d.node("metrics", 760, 235, 240, 90, ["Serviço de métricas", "hits e linha do tempo"],
           "service")
    d.node("persistence", 760, 390, 240, 130, ["SQLAlchemy + modelos", "PostgreSQL"], "data")
    d.node("monitor", 760, 570, 240, 90, ["Instrumentação HTTP", "exposição /metrics"], "service")

    d.edge([(240, 405), (300, 405), (300, 295), (380, 295)], "REST", lseg=2)
    d.edge([(240, 455), (380, 455)], "REST", lpos=(320, 455))
    d.edge([(240, 505), (300, 505), (300, 615), (380, 615)], "REST", lseg=2)
    d.edge([d.p("detector", "bottom"), d.p("fights", "top")], "eventos", lpos=(500, 193))
    d.edge([d.p("robo", "top"), d.p("ranking", "bottom")], "HTTP", lpos=(500, 736))
    d.edge([(620, 280), (760, 280)], "calcula")
    d.edge([(620, 320), (680, 320), (680, 415), (760, 415)], "consulta/persiste", lseg=1)
    d.edge([(620, 455), (760, 455)], "lê dados", lpos=(700, 455))
    d.edge([(620, 615), (680, 615), (680, 495), (760, 495)], "grava snapshot", lseg=1)
    d.save()


def mvvm():
    d = Diagram("mvvm", "Frontend | Mapeamento MVVM conceitual",
                "View, ViewModel e Model no frontend React, com o backend FastAPI.", 1220, 610)
    d.node("user", 60, 85, 260, 70, ["Pessoa usuária"], "actor")
    d.node("view", 60, 250, 260, 110, ["View", "páginas e componentes React", "formulários/gráficos"],
           "ui")
    d.node("vm", 480, 250, 260, 110, ["ViewModel conceitual", "hooks, estado e ações",
                                      "fetch e filtros"], "service")
    d.node("model", 900, 250, 260, 110, ["Model/API", "payloads de luta e métricas",
                                         "REST + persistência"], "data")
    d.node("backend", 900, 470, 260, 80, ["Backend FastAPI"], "external")
    d.edge([d.p("user", "bottom"), d.p("view", "top")], "interage")
    d.edge([d.p("view", "right", 0.3), d.p("vm", "left", 0.3)], "eventos e estado")
    d.edge([d.p("vm", "left", 0.7), d.p("view", "right", 0.7)], "dados de apresentação")
    d.edge([d.p("vm", "right"), d.p("model", "left")], "HTTP/JSON")
    d.edge([d.p("model", "bottom"), d.p("backend", "top")], "consulta/atualiza")
    d.save()


def pipeline():
    d = Diagram("pipeline-dados", "HitTrack | Pipeline de dados e fontes",
                "Entradas de hits passam pela API até o banco e o frontend; o ranking "
                "RoboCore segue um caminho separado.", 1340, 680)
    d.node("video", 40, 120, 210, 80, ["Vídeo da luta"], "external")
    d.node("json", 40, 300, 210, 80, ["Hits JSON", "importação manual"], "external")
    d.node("detector", 380, 120, 220, 80, ["hitcount-ia", "hits detectados"], "external")
    d.node("validate", 380, 300, 220, 80, ["API", "validação e aliases"], "system")
    d.node("db", 730, 300, 220, 80, ["PostgreSQL", "Fight + HitEvent"], "data")
    d.node("metrics", 1080, 300, 220, 80, ["Serviços", "métricas por luta/agregadas"], "service")
    d.node("rank", 40, 520, 210, 80, ["RoboCore", "ranking por categoria"], "external")
    d.node("snapshot", 380, 520, 220, 80, ["Snapshot de ranking", "separado dos hits"], "data")
    d.node("dashboard", 1080, 505, 220, 110, ["Frontend", "gráficos, histórico", "e sugestões limitadas"],
           "ui")
    d.edge([d.p("video", "right"), d.p("detector", "left")], "entrada")
    d.edge([d.p("detector", "bottom"), d.p("validate", "top")], "eventos")
    d.edge([d.p("json", "right"), d.p("validate", "left")], "eventos")
    d.edge([d.p("validate", "right"), d.p("db", "left")], "eventos validados")
    d.edge([d.p("db", "right"), d.p("metrics", "left")], "dados persistidos")
    d.edge([d.p("metrics", "bottom"), d.p("dashboard", "top")], "respostas REST")
    d.edge([d.p("rank", "right"), d.p("snapshot", "left")], "consulta externa")
    d.edge([d.p("snapshot", "right"), (1080, 560)], "ELO oficial importado", lpos=(840, 560))
    d.save()


def modelo_er():
    d = Diagram("modelo-er", "Persistência | Modelo entidade-relacionamento",
                "Tabelas fights, hit_events, ranking_snapshots e ranking_entries "
                "com suas chaves e relações 1:N.", 1100, 840)
    row_h, head_h, w = 26, 40, 340

    def table(key, x, y, name, rows):
        fill, stroke = STYLES["entity"]
        h = head_h + len(rows) * row_h + 10
        d.nodes[key] = Node(x, y, w, h)
        d.raw(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#ffffff" '
              f'stroke="{stroke}" stroke-width="2"/>')
        d.raw(f'<path d="M {x} {y + head_h} V {y + 10} Q {x} {y} {x + 10} {y} H {x + w - 10} '
              f'Q {x + w} {y} {x + w} {y + 10} V {y + head_h} Z" fill="{fill}" stroke="{stroke}" '
              f'stroke-width="2"/>')
        d.raw(f'<text x="{x + w / 2}" y="{y + 26}" text-anchor="middle" font-family="{FONT}" '
              f'font-size="15" font-weight="700" fill="{TEXT}">{escape(name)}</text>')
        ys = {}
        for i, (tag, col, typ) in enumerate(rows):
            ry = y + head_h + 5 + i * row_h + row_h / 2
            ys[col] = ry
            if tag:
                color = "#b2541a" if tag == "PK" else "#3973a8"
                d.raw(f'<text x="{x + 14}" y="{ry + 4.5}" font-family="{FONT}" font-size="11" '
                      f'font-weight="700" fill="{color}">{tag}</text>')
            d.raw(f'<text x="{x + 46}" y="{ry + 4.5}" font-family="{FONT}" font-size="13" '
                  f'font-weight="{700 if tag else 400}" fill="{TEXT}">{escape(col)}</text>')
            d.raw(f'<text x="{x + w - 14}" y="{ry + 4.5}" text-anchor="end" font-family="{FONT}" '
                  f'font-size="12" fill="#7a8c96">{escape(typ)}</text>')
        return ys

    f = table("fight", 60, 116, "fights", [
        ("PK", "id", "integer"),
        ("", "competition, category", "string"),
        ("", "fought_at, created_at", "datetime"),
        ("", "robot_red, robot_green", "string"),
        ("", "team_red, team_green", "string"),
        ("", "status, result, winner_robot", "string"),
        ("", "duration_seconds, fps", "float"),
        ("", "elo_red, elo_green", "float"),
        ("", "video_source, video_filename", "text"),
        ("", "robot_aliases, is_test", "json / bool"),
    ])
    h = table("hit", 700, 90, "hit_events", [
        ("PK", "id", "integer"),
        ("FK", "fight_id", "integer"),
        ("", "frame", "integer"),
        ("", "robot", "string"),
        ("", "source_robot", "string"),
    ])
    s = table("snap", 60, 496, "ranking_snapshots", [
        ("PK", "id", "integer"),
        ("", "category", "string"),
        ("", "source_url", "string"),
        ("", "imported_at", "datetime"),
    ])
    e = table("entry", 700, 470, "ranking_entries", [
        ("PK", "id", "integer"),
        ("FK", "snapshot_id", "integer"),
        ("", "rank_position, elo_score", "int / float"),
        ("", "robot_name, team_name", "string"),
        ("", "total_fights, wins, losses", "integer"),
        ("", "latest_fight_at", "datetime"),
        ("", "robot_url, robot_source_id", "string / int"),
    ])
    d.edge([(400, f["id"]), (700, h["fight_id"])],
           "1 : N  (hits)", lpos=(550, f["id"] - 16), arrow=False,
           marker_start="er-one", marker_end="er-many")
    d.edge([(400, s["id"]), (700, e["snapshot_id"])],
           "1 : N  (entries)", lpos=(550, s["id"] - 16), arrow=False,
           marker_start="er-one", marker_end="er-many")
    d.free_text(60, 800, "Legenda: ‖ exatamente um  ·  pé de galinha: um ou muitos  ·  "
                "PK chave primária  ·  FK chave estrangeira  ·  filhos excluídos em cascata",
                12, anchor="start")
    d.save()


if __name__ == "__main__":
    casos_de_uso()
    atividades()
    navegacao()
    c4_contexto()
    c4_containers()
    c4_componentes()
    mvvm()
    pipeline()
    modelo_er()
    print("Diagramas gerados em", OUT_DIR)
