import os
import sqlite3
import json
from pyvis.network import Network

TARGET_CASE_ID = "CASE-BR-PAT-2023-00207"

# 1. Database Path
DB_PATH = r"C:\Users\dipik\Downloads\CrimeNet-Sovereign-Mesh-main\CrimeNet-Sovereign-Mesh-main\core_engine\data\crimenet_sovereign_mesh.db"
OUTPUT_HTML = os.path.abspath(os.path.join(os.path.dirname(__file__), "backend", "crime_network_visualization.html"))

if not os.path.exists(DB_PATH):
    print(f"[!] Database not found at: {DB_PATH}")
    exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print(f"[*] Extracting investigative network for {TARGET_CASE_ID}...")

# 2. Extract FIR, Victim (Complainant), and Accused
cur.execute("""
    SELECT fir_id, fir_number, police_station, complainant_name, accused_named_json, bns_sections, incident_narrative
    FROM cctns_iif1_fir
    WHERE case_id = ?
""", (TARGET_CASE_ID,))
fir_row = cur.fetchone()

net = Network(height="100%", width="100%", bgcolor="transparent", font_color="#18181b", directed=True)
net.barnes_hut(gravity=-3500, central_gravity=0.3, spring_length=150, spring_strength=0.05, damping=0.9)

added_nodes = set()

def add_clean_node(n_id, label, title, group, shape, color, border_color="#000000", size=25):
    if n_id not in added_nodes:
        added_nodes.add(n_id)
        net.add_node(
            n_id,
            label=label,
            title=title,
            shape=shape,
            color={'background': color, 'border': border_color, 'highlight': {'background': '#ffffff', 'border': '#10b981'}},
            borderWidth=2,
            size=size,
            font={'face': 'monospace', 'size': 12, 'bold': True}
        )

# 3. Add FIR Node
fir_node_uid = f"CRIME_INCIDENT:{TARGET_CASE_ID}"
cur.execute("SELECT node_id FROM hin_nodes WHERE entity_uid = ?", (fir_node_uid,))
fir_hin = cur.fetchone()
fir_nid = fir_hin["node_id"] if fir_hin else 999999

add_clean_node(
    fir_nid,
    label=f"[CRIME EVENT]\nFIR {fir_row['fir_number'] if fir_row else TARGET_CASE_ID}",
    title=f"Incident: {TARGET_CASE_ID}\nPolice Station: {fir_row['police_station'] if fir_row else 'N/A'}",
    group="incident",
    shape="box",
    color="#e4e4e7",
    border_color="#71717a",
    size=30
)

# 4. Add Victim (Complainant) Node
if fir_row and fir_row["complainant_name"]:
    victim_name = fir_row["complainant_name"]
    victim_nid = 888888
    add_clean_node(
        victim_nid,
        label=f"[VICTIM / COMPLAINANT]\n{victim_name}",
        title=f"Complainant in FIR {fir_row['fir_number']}\nFiled at: {fir_row['police_station']}",
        group="victim",
        shape="ellipse",
        color="#86efac",
        border_color="#16a34a",
        size=28
    )
    net.add_edge(victim_nid, fir_nid, label="LODGED_FIR", color="#16a34a", width=2.5)

# 5. Extract Case Subgraph (Edges directly or 2-hops away)
query = """
WITH RECURSIVE case_network(node_id, depth) AS (
    SELECT ?, 0
    UNION
    SELECT CASE WHEN e.src_node_id = cn.node_id THEN e.dst_node_id ELSE e.src_node_id END, cn.depth + 1
    FROM hin_edges e
    JOIN case_network cn ON (e.src_node_id = cn.node_id OR e.dst_node_id = cn.node_id)
    WHERE cn.depth < 2
)
SELECT DISTINCT 
    e.src_node_id, e.dst_node_id, e.edge_type, e.affinity_weight, e.xai_human_readable_path,
    n1.entity_uid as src_uid, n1.node_type as src_type, n1.canonical_label as src_label, n1.risk_score as src_risk, n1.is_shatter_point as src_shatter,
    n2.entity_uid as dst_uid, n2.node_type as dst_type, n2.canonical_label as dst_label, n2.risk_score as dst_risk, n2.is_shatter_point as dst_shatter
FROM hin_edges e
JOIN hin_nodes n1 ON e.src_node_id = n1.node_id
JOIN hin_nodes n2 ON e.dst_node_id = n2.node_id
WHERE e.src_node_id IN (SELECT node_id FROM case_network)
  AND e.dst_node_id IN (SELECT node_id FROM case_network)
LIMIT 35;
"""

cur.execute(query, (fir_nid,))
edges = cur.fetchall()

def resolve_node_styling(nid, uid, ntype, label, risk, is_shatter):
    # Rule 1: Human Accused / Syndicate Boss = Real Mastermind
    if ntype == "PERSON":
        if risk >= 0.8:
            return f"[MASTERMIND]\n{label}", "ellipse", "#f87171", "#dc2626", 32
        return f"[SUSPECT]\n{label}", "box", "#fde047", "#ca8a04", 24
    
    # Rule 2: ATM Kiosks = Cash-out Shatter Point (NOT Mastermind!)
    if is_shatter == 1 or "ATM_" in uid or "Terminal Kiosk" in label:
        return f"[CASH-OUT ATM]\n{label}", "box", "#fca5a5", "#991b1b", 26
    
    # Rule 3: Mule Bank Accounts
    if ntype == "ACCOUNT_UPI":
        return f"[MULE A/C]\n{label}", "box", "#fdba74", "#ea580c", 22
    
    # Rule 4: Telecom Device / Phone
    if ntype == "PHONE_MSISDN":
        return f"[PHONE LOG]\n{label}", "box", "#cbd5e1", "#475569", 20

    # Rule 5: Cell Tower
    if ntype == "CELL_TOWER_CGI":
        return f"[CELL TOWER]\n{label}", "ellipse", "#e2e8f0", "#64748b", 20

    return f"[{ntype}]\n{label}", "box", "#e4e4e7", "#71717a", 20

for row in edges:
    # Source Node Add
    s_label, s_shape, s_bg, s_border, s_size = resolve_node_styling(
        row["src_node_id"], row["src_uid"], row["src_type"], row["src_label"], row["src_risk"], row["src_shatter"]
    )
    add_clean_node(row["src_node_id"], s_label, f"{row['src_type']}: {row['src_label']}", row["src_type"], s_shape, s_bg, s_border, s_size)

    # Destination Node Add
    d_label, d_shape, d_bg, d_border, d_size = resolve_node_styling(
        row["dst_node_id"], row["dst_uid"], row["dst_type"], row["dst_label"], row["dst_risk"], row["dst_shatter"]
    )
    add_clean_node(row["dst_node_id"], d_label, f"{row['dst_type']}: {row['dst_label']}", row["dst_type"], d_shape, d_bg, d_border, d_size)

    # Edge Style
    edge_color = "#b22222" if "TRANSFERRED" in row["edge_type"] or "CO_ACCUSED" in row["edge_type"] else "#71717a"
    net.add_edge(
        row["src_node_id"], 
        row["dst_node_id"], 
        title=f"Link: {row['edge_type']}\n{row['xai_human_readable_path']}", 
        color=edge_color,
        width=2.0
    )

conn.close()

# 6. Write and Inject Inspector Telemetry Script
temp_file = "temp_crime_mesh.html"
net.save_graph(temp_file)

with open(temp_file, "r", encoding="utf-8") as f:
    html_content = f.read()

corkboard_theme = """
<style>
body, html {
    background-color: #a87949 !important;
    background-image: radial-gradient(#8c6135 15%, transparent 16%), radial-gradient(#8c6135 15%, transparent 16%);
    background-size: 40px 40px;
    background-position: 0 0, 20px 20px;
    margin: 0; width: 100%; height: 100%; overflow: hidden;
}
#mynetwork { background: transparent !important; width: 100%; height: 100vh; }
.legend-card {
    position: fixed; bottom: 25px; left: 25px; z-index: 1000;
    background: rgba(255, 253, 250, 0.95); padding: 12px 18px;
    border: 2px solid #5c3a21; border-radius: 6px; font-family: monospace;
    font-size: 11px; box-shadow: 4px 4px 15px rgba(0,0,0,0.3);
}
.legend-item { display: flex; items-center; margin-bottom: 5px; }
.legend-color { width: 12px; height: 12px; margin-right: 8px; border-radius: 2px; display: inline-block; }
</style>

<div class="legend-card">
    <div style="font-weight: bold; margin-bottom: 6px; color: #3f220e;">POLICE CASE WORKBENCH</div>
    <div class="legend-item"><span class="legend-color" style="background: #86efac; border: 1px solid #16a34a;"></span> Victim / Complainant</div>
    <div class="legend-item"><span class="legend-color" style="background: #f87171; border: 1px solid #dc2626;"></span> Accused Mastermind (Person)</div>
    <div class="legend-item"><span class="legend-color" style="background: #fdba74; border: 1px solid #ea580c;"></span> Mule Bank Accounts</div>
    <div class="legend-item"><span class="legend-color" style="background: #fca5a5; border: 1px solid #991b1b;"></span> Shatter Point (Cash-Out ATM)</div>
</div>

<script type="text/javascript">
setTimeout(function() {
    if (typeof network !== 'undefined') {
        network.on("click", function (params) {
            if (params.nodes.length > 0) {
                var nodeId = params.nodes[0];
                window.parent.postMessage({ type: "NODE_CLICK", payload: nodeId }, "*");
            } else {
                window.parent.postMessage({ type: "CANVAS_CLICK" }, "*");
            }
        });
    }
}, 800);
</script>
"""

html_content = html_content.replace("</body>", f"{corkboard_theme}</body>")

os.makedirs(os.path.dirname(OUTPUT_HTML), exist_ok=True)
with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html_content)

if os.path.exists(temp_file):
    os.remove(temp_file)

print(f"[+] Clean investigative board deployed directly to: {OUTPUT_HTML}")