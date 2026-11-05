/**
 * dsh-net-dashboard - browser half.
 *
 * Registered through the lazy-CJS module loader facade; every side effect
 * (CSS injection included) lives inside the factory closure and runs at
 * materialization. Contributes:
 *
 *   - `sidebar.panellist` entry `net-dashboard` (order 31 — directly below
 *     the built-in panel rows, under 技能中心), with a pulse glyph;
 *   - the `main` panel keyed `net-dashboard`: the live network dashboard.
 *
 * Layout (key-first, details on demand):
 *
 *   header       title / hostname / live toggle / refresh / last update
 *   KPI strip    four always-on tiles: down rate · up rate · latency · sessions
 *   traffic card down/up rate curves (+ per-interface details on expand)
 *   latency card per-target live row: value · loss · mini curve (+ stats)
 *   sessions     TCP/UDP totals · top state bars (+ full breakdown & trend)
 *   network      primary interface / gateway / DNS / public IP (+ full
 *                identity rows and the whole interface table on expand)
 *
 * Every card is collapsed to its key numbers by default; its "详情" control
 * discloses the deeper rows. The dashboard polls the loopback-only host route
 * `api/net-dashboard/snapshot` every 3 seconds (toggleable, persisted in
 * localStorage), keeps client-side rolling history for the traffic/session
 * curves, and charts the host's 1-second latency window directly. All charts
 * are hand-drawn SVG (zero chart dependency); colors ride the shell theme
 * tokens so light and dark both work.
 */
window.__ModuleLoader__.load({
	id: "dsh-net-dashboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/constants.js
		/** Locale namespace owned by this plugin. */
		const NS = "dsh-net-dashboard";
		/** Sidebar panel id — also the `main` slot key. */
		const PANEL_ID = "net-dashboard";
		/** Sidebar row order: after the built-in rows (plugins 0, schedules 10, skill center 30). */
		const PANEL_ORDER = 31;
		/** Dashboard refresh cadence, in ms. */
		const REFRESH_MS = 3000;
		/** Client-side rolling history length (points, ~8 minutes at 3s). */
		const HISTORY_POINTS = 160;
		/** Document-relative API path (the GUI is served with a <base href>). */
		const API_SNAPSHOT = "api/net-dashboard/snapshot";
		/** localStorage key persisting the auto-refresh choice. */
		const AUTO_REFRESH_KEY = NS + ":autorefresh";
		//#endregion
		//#region src/client/dictionaries.js
		const zh = {
			"entry.label": "网络巡检看板",
			"title": "网络巡检看板",
			"subtitle": "本机网络质量实时观测",
			"live": "实时刷新",
			"paused": "实时已暂停",
			"manual": "手动刷新",
			"refreshing": "刷新中…",
			"lastUpdate": "更新于",
			"loadError": "无法获取网络快照",
			"stale": "数据已过期",
			"details": "详情",
			"collapse": "收起",
			"section.network": "网络",
			"section.interfaces": "网络接口",
			"section.traffic": "实时流量",
			"section.sessions": "会话",
			"section.latency": "网络延迟",
			"publicIp": "公网 IP",
			"location": "参考位置",
			"gateway": "网关",
			"dns": "DNS",
			"hostname": "主机名",
			"platform": "系统",
			"wifi": "Wi-Fi",
			"signal": "信号",
			"kpi.latency": "网关延迟",
			"kpi.sessions": "TCP 会话",
			"iface.primary": "主接口",
			"iface.title": "全部接口",
			"iface.mac": "MAC",
			"iface.ipv4": "IPv4",
			"iface.ipv6": "IPv6",
			"iface.mtu": "MTU",
			"iface.count": "共 {n} 个接口",
			"iface.showAll": "展开全部 {n} 个",
			"iface.collapse": "收起",
			"primaryTag": "主接口",
			"loopbackTag": "本地环回",
			"down": "下载 ↓",
			"up": "上传 ↑",
			"now": "当前",
			"peak": "峰值",
			"avg": "均值",
			"min": "最小",
			"max": "最大",
			"jitter": "抖动",
			"loss": "丢包率",
			"tcpSessions": "TCP 会话",
			"udpSockets": "UDP",
			"states": "状态分布",
			"otherStates": "其他 {n} 项",
			"latency.gateway": "网关 {target}",
			"latency.target": "目标 {target}",
			"latency.dead": "不可达",
			"totals": "合计",
			"totalBytes": "累计收发",
			"traffic.byInterface": "接口流量",
			"traffic.noTraffic": "当前无流量",
			"session.trend": "会话数趋势",
			"sentReceived": "收/发",
			"empty": "等待首帧数据…",
			"noWifi": "未获取到 Wi-Fi 信息（macOS 隐藏时显示为空）",
			"windowsTitle": "网络巡检看板"
		};
		const en = {
			"entry.label": "Network Dashboard",
			"title": "Network Dashboard",
			"subtitle": "Live view of this machine's network quality",
			"live": "Live refresh",
			"paused": "Live paused",
			"manual": "Refresh now",
			"refreshing": "Refreshing…",
			"lastUpdate": "Updated",
			"loadError": "Could not fetch the network snapshot",
			"stale": "Data is stale",
			"details": "Details",
			"collapse": "Collapse",
			"section.network": "Network",
			"section.interfaces": "Interfaces",
			"section.traffic": "Live traffic",
			"section.sessions": "Sessions",
			"section.latency": "Latency",
			"publicIp": "Public IP",
			"location": "Location",
			"gateway": "Gateway",
			"dns": "DNS",
			"hostname": "Hostname",
			"platform": "System",
			"wifi": "Wi-Fi",
			"signal": "Signal",
			"kpi.latency": "Gateway latency",
			"kpi.sessions": "TCP sessions",
			"iface.primary": "Primary",
			"iface.title": "All interfaces",
			"iface.mac": "MAC",
			"iface.ipv4": "IPv4",
			"iface.ipv6": "IPv6",
			"iface.mtu": "MTU",
			"iface.count": "{n} interfaces",
			"iface.showAll": "Show all {n}",
			"iface.collapse": "Collapse",
			"primaryTag": "primary",
			"loopbackTag": "loopback",
			"down": "Down ↓",
			"up": "Up ↑",
			"now": "now",
			"peak": "peak",
			"avg": "avg",
			"min": "min",
			"max": "max",
			"jitter": "jitter",
			"loss": "loss",
			"tcpSessions": "TCP sessions",
			"udpSockets": "UDP",
			"states": "State breakdown",
			"otherStates": "{n} more",
			"latency.gateway": "Gateway {target}",
			"latency.target": "Target {target}",
			"latency.dead": "unreachable",
			"totals": "Totals",
			"totalBytes": "Total transfer",
			"traffic.byInterface": "Per interface",
			"traffic.noTraffic": "No traffic now",
			"session.trend": "Session trend",
			"sentReceived": "in/out",
			"empty": "Waiting for the first sample…",
			"noWifi": "Wi-Fi details unavailable (hidden by macOS)",
			"windowsTitle": "Network Dashboard"
		};
		//#endregion
		//#region src/client/styles.js
		/** Inject the dashboard stylesheet once (same pattern as official plugin CSS). */
		const CSS = ".dnd-view{height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);display:flex;flex-direction:column}"
			+ ".dnd-header{flex:none;display:flex;align-items:center;gap:10px;padding:14px 20px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}"
			+ ".dnd-title-wrap{display:flex;flex-direction:column;gap:1px;min-width:0}"
			+ ".dnd-title{font-size:17px;font-weight:700;margin:0;line-height:23px;letter-spacing:.01em}"
			+ ".dnd-subtitle{font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
			+ ".dnd-header-spacer{flex:1}"
			+ ".dnd-status{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}"
			+ ".dnd-status-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary);transition:background .2s}"
			+ ".dnd-status-dot[data-live=true]{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent)}"
			+ ".dnd-status-dot[data-err=true]{background:var(--dsw-alias-state-error-primary)}"
			+ ".dnd-live-toggle{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:11.5px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:3px 10px 3px 6px;background:transparent;transition:background .15s,border-color .15s}"
			+ ".dnd-live-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}"
			+ ".dnd-switch{cursor:pointer;background:var(--dsw-alias-border-l2);border-radius:99px;flex:none;width:24px;height:14px;transition:background .18s;position:relative;display:inline-block}"
			+ ".dnd-switch-thumb{background:var(--dsw-alias-bg-base);border-radius:50%;width:10px;height:10px;transition:left .18s;position:absolute;top:2px;left:2px;box-shadow:0 0 2px #0003}"
			+ ".dnd-switch[data-on=true]{background:var(--dsw-alias-state-success-primary)}"
			+ ".dnd-switch[data-on=true] .dnd-switch-thumb{left:12px}"
			+ ".dnd-icon-button{box-sizing:border-box;width:26px;height:26px;border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:none;transition:background .15s,color .15s}"
			+ ".dnd-icon-button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}"
			+ ".dnd-icon-button[data-spin=true] svg{animation:dnd-spin .8s linear infinite}"
			+ "@keyframes dnd-spin{to{transform:rotate(360deg)}}"
			+ ".dnd-last-update{font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}"
			+ ".dnd-scroll{flex:1;min-height:0;overflow-y:auto;padding:14px 20px 20px;display:flex;flex-direction:column;gap:12px;container-type:inline-size}"
			+ ".dnd-error{border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);border-radius:10px;padding:7px 12px;font-size:12px;line-height:1.5;flex:none}"
			+ ".dnd-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;flex:none}"
			+ "@container (min-width:680px){.dnd-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}"
			+ ".dnd-kpi{display:flex;flex-direction:column;gap:2px;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:9px 13px 10px;background:var(--dsw-alias-bg-layer-1)}"
			+ ".dnd-kpi-label{font-size:10.5px;color:var(--dsw-alias-label-tertiary);letter-spacing:.01em}"
			+ ".dnd-kpi-value{font-size:21px;font-weight:700;line-height:1.25;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
			+ ".dnd-kpi-value[data-dir=down]{color:var(--dsw-alias-state-business-primary)}"
			+ ".dnd-kpi-value[data-dir=up]{color:var(--dsw-alias-state-warn-primary)}"
			+ ".dnd-kpi[data-bad=true] .dnd-kpi-value{color:var(--dsw-alias-state-error-primary)}"
			+ ".dnd-kpi-sub{font-size:10.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
			+ ".dnd-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-content:start;align-items:start}"
			+ "@container (min-width:680px){.dnd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}"
			+ ".dnd-card{display:flex;flex-direction:column;gap:10px;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;padding:13px 15px 14px;background:var(--dsw-alias-bg-layer-1);transition:border-color .18s}"
			+ ".dnd-card:hover{border-color:var(--dsw-alias-border-l2)}"
			+ ".dnd-card-head{display:flex;align-items:center;gap:8px;flex:none;min-height:20px}"
			+ ".dnd-card-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0;flex:1;letter-spacing:.015em}"
			+ ".dnd-card-extra{font-size:10.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}"
			+ ".dnd-detail-btn{display:inline-flex;align-items:center;gap:3px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:1;padding:3px 4px 3px 6px;margin-right:-4px;border-radius:6px;cursor:pointer;flex:none;transition:color .15s,background .15s}"
			+ ".dnd-detail-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}"
			+ ".dnd-chevron{transition:transform .18s ease}"
			+ ".dnd-detail-btn[aria-expanded=true] .dnd-chevron{transform:rotate(180deg)}"
			+ ".dnd-details{border-top:1px dashed var(--dsw-alias-border-l1);margin-top:2px;padding-top:10px;display:flex;flex-direction:column;gap:8px;animation:dnd-reveal .18s ease-out}"
			+ ".dnd-details-inner{display:flex;flex-direction:column;gap:7px;min-width:0}"
			+ "@keyframes dnd-reveal{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}"
			+ ".dnd-subhead{font-size:10px;font-weight:600;color:var(--dsw-alias-label-tertiary);letter-spacing:.06em;margin-top:2px}"
			+ ".dnd-series-list{display:flex;flex-direction:column;gap:12px}"
			+ ".dnd-series-head{display:flex;align-items:baseline;gap:8px}"
			+ ".dnd-series-label{font-size:11.5px;color:var(--dsw-alias-label-secondary);flex:1}"
			+ ".dnd-series-sub{font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}"
			+ ".dnd-series-value{font-size:22px;font-weight:700;line-height:1.25;font-variant-numeric:tabular-nums}"
			+ ".dnd-series-value[data-dir=down]{color:var(--dsw-alias-state-business-primary)}"
			+ ".dnd-series-value[data-dir=up]{color:var(--dsw-alias-state-warn-primary)}"
			+ ".dnd-lat-list{display:flex;flex-direction:column;gap:9px}"
			+ ".dnd-lat-row{display:grid;grid-template-columns:minmax(72px,auto) auto auto minmax(56px,1fr);align-items:center;gap:10px}"
			+ ".dnd-lat-name{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
			+ ".dnd-lat-value{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}"
			+ ".dnd-lat-value[data-dead=true]{color:var(--dsw-alias-label-tertiary)}"
			+ ".dnd-loss-chip{font-size:10px;line-height:1.6;border-radius:999px;padding:0 6px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);white-space:nowrap;justify-self:start}"
			+ ".dnd-loss-chip[data-bad=true]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}"
			+ ".dnd-lat-chart{min-width:0;display:flex;align-items:center}"
			+ ".dnd-lat-details{display:flex;flex-direction:column;gap:8px}"
			+ ".dnd-lat-statblock{display:flex;flex-direction:column;gap:2px;min-width:0}"
			+ ".dnd-lat-statname{font-size:11px;color:var(--dsw-alias-label-secondary)}"
			+ ".dnd-lat-stats{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}"
			+ ".dnd-lat-stats b{color:var(--dsw-alias-label-secondary);font-weight:600}"
			+ ".dnd-lat-stats [data-bad=true] b{color:var(--dsw-alias-state-error-primary)}"
			+ ".dnd-sess-top{display:flex;align-items:flex-end;gap:16px;min-width:0}"
			+ ".dnd-sess-big{flex:none;display:flex;flex-direction:column;gap:0}"
			+ ".dnd-sess-num{font-size:30px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}"
			+ ".dnd-sess-label{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}"
			+ ".dnd-sess-bars{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}"
			+ ".dnd-bars{display:flex;flex-direction:column;gap:5px;min-width:0}"
			+ ".dnd-bar-row{display:flex;align-items:center;gap:8px;min-width:0}"
			+ ".dnd-bar-label{flex:none;width:84px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--ds-font-family-code,monospace);font-size:10px}"
			+ ".dnd-bar-track{flex:1;height:6px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden;min-width:36px}"
			+ ".dnd-bar-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-state-business-primary)}"
			+ ".dnd-bar-count{flex:none;width:32px;text-align:right;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;font-size:11px}"
			+ ".dnd-net-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}"
			+ ".dnd-net-item{display:flex;flex-direction:column;gap:1px;min-width:0}"
			+ ".dnd-net-label{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}"
			+ ".dnd-net-value{font-size:12.5px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;word-break:normal;overflow-wrap:break-word;font-family:var(--ds-font-family-code,monospace)}"
			+ ".dnd-net-value[data-dim=true]{color:var(--dsw-alias-label-tertiary)}"
			+ ".dnd-kv{display:flex;flex-direction:column;gap:4px;min-width:0}"
			+ ".dnd-kv-row{display:flex;gap:10px;font-size:12px;line-height:1.5;min-width:0}"
			+ ".dnd-kv-key{flex:none;width:64px;color:var(--dsw-alias-label-tertiary)}"
			+ ".dnd-kv-val{color:var(--dsw-alias-label-primary);word-break:break-all;min-width:0;font-variant-numeric:tabular-nums}"
			+ ".dnd-kv-val[data-dim=true]{color:var(--dsw-alias-label-tertiary)}"
			+ ".dnd-iface-list{display:flex;flex-direction:column;min-width:0}"
			+ ".dnd-iface-row{display:grid;grid-template-columns:minmax(52px,auto) 1fr auto;gap:3px 10px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);align-items:baseline;min-width:0}"
			+ ".dnd-iface-row:last-child{border-bottom:none}"
			+ ".dnd-iface-row[data-dim=true]{opacity:.55}"
			+ ".dnd-iface-name{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}"
			+ ".dnd-iface-addr{display:flex;flex-direction:column;gap:1px;min-width:0}"
			+ ".dnd-iface-line{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,monospace);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
			+ ".dnd-iface-rate{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}"
			+ ".dnd-tag{font-size:9.5px;line-height:1.5;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:0 6px;white-space:nowrap}"
			+ ".dnd-tag[data-tone=primary]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}"
			+ ".dnd-note{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5}"
			+ ".dnd-empty{padding:40px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px}";
		const CSS_TAG_ID = NS + "/dashboard.css";
		if (typeof document !== "undefined") {
			const existing = document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]');
			if (existing !== null) existing.remove();
			const tag = document.createElement("style");
			tag.dataset.plugin = NS;
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/api.js
		/** Fetch one network snapshot; throws on non-2xx. */
		async function fetchSnapshot() {
			const response = await fetch(API_SNAPSHOT);
			const body = await response.json().catch(() => undefined);
			if (!response.ok) throw new Error(typeof (body && body.error) === "string" ? body.error : "HTTP " + response.status);
			return body;
		}
		//#endregion
		//#region src/client/format.js
		/** Format a bytes-per-second rate ("1.2 MB/s"); null renders as an em dash. */
		function formatRate(bps) {
			if (typeof bps !== "number" || !Number.isFinite(bps)) return "—";
			if (bps < 1024) return Math.round(bps) + " B/s";
			const kb = bps / 1024;
			if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + " KB/s";
			const mb = kb / 1024;
			if (mb < 1024) return mb.toFixed(mb < 100 ? 2 : 1) + " MB/s";
			return (mb / 1024).toFixed(2) + " GB/s";
		}
		/** Format a byte total ("10.5 GB"). */
		function formatBytes(total) {
			if (typeof total !== "number" || !Number.isFinite(total)) return "—";
			if (total < 1024) return Math.round(total) + " B";
			const kb = total / 1024;
			if (kb < 1024) return kb.toFixed(0) + " KB";
			const mb = kb / 1024;
			if (mb < 1024) return mb.toFixed(1) + " MB";
			const gb = mb / 1024;
			if (gb < 1024) return gb.toFixed(2) + " GB";
			return (gb / 1024).toFixed(2) + " TB";
		}
		/** Format one latency reading ("8.42 ms"). */
		function formatMs(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			if (value >= 100) return Math.round(value) + " ms";
			if (value >= 10) return value.toFixed(1) + " ms";
			return value.toFixed(2) + " ms";
		}
		/** Clock time of a timestamp ("15:42:07"). */
		function clockOf(ts) {
			if (typeof ts !== "number") return "—";
			const date = new Date(ts);
			const pad = (value) => String(value).padStart(2, "0");
			return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
		}
		//#endregion
		//#region src/client/history.js
		/**
		 * Rolling client-side history for the curves that only exist per poll
		 * (traffic rates, session totals). Module-level: survives dashboard
		 * open/close within one page session.
		 */
		const history = {
			down: [],
			up: [],
			sessions: []
		};
		/** Append one value to a history array, capping its length. */
		function pushHistory(array, value) {
			array.push(value);
			if (array.length > HISTORY_POINTS) array.splice(0, array.length - HISTORY_POINTS);
		}
		/** Feed one snapshot into the history buffers. */
		function recordSnapshot(snapshot) {
			pushHistory(history.down, snapshot && snapshot.traffic && snapshot.traffic.totals ? snapshot.traffic.totals.irate : null);
			pushHistory(history.up, snapshot && snapshot.traffic && snapshot.traffic.totals ? snapshot.traffic.totals.orate : null);
			pushHistory(history.sessions, snapshot && snapshot.sessions ? snapshot.sessions.tcpTotal : null);
		}
		//#endregion
		//#region src/client/charts.js
		/** Internal chart coordinate system. */
		const CHART_W = 320;
		const CHART_H = 96;
		const CHART_PAD_Y = 8;
		/** Map one series to SVG path segments, splitting at null samples. */
		function seriesSegments(values, min, max) {
			const span = max - min || 1;
			const step = values.length > 1 ? CHART_W / (values.length - 1) : CHART_W;
			const yOf = (value) => CHART_H - CHART_PAD_Y - ((value - min) / span) * (CHART_H - CHART_PAD_Y * 2);
			const segments = [];
			let current = null;
			for (let index = 0; index < values.length; index += 1) {
				const value = values[index];
				if (typeof value !== "number" || !Number.isFinite(value)) {
					if (current !== null) segments.push(current);
					current = null;
					continue;
				}
				const x = values.length > 1 ? index * step : CHART_W;
				const point = x.toFixed(1) + "," + yOf(value).toFixed(1);
				if (current === null) current = [];
				current.push(point);
			}
			if (current !== null) segments.push(current);
			return segments.map((points) => "M" + points.join(" L"));
		}
		/** Domain of one or more series; zero-based when asked. */
		function domainOf(series, zeroBase) {
			let min = Infinity;
			let max = -Infinity;
			let any = false;
			for (const entry of series) {
				for (const value of entry.values) {
					if (typeof value !== "number" || !Number.isFinite(value)) continue;
					any = true;
					if (value < min) min = value;
					if (value > max) max = value;
				}
			}
			if (!any) return { min: 0, max: 1 };
			if (zeroBase) min = 0;
			if (max === min) max = min + 1;
			return { min, max: max + (max - min) * 0.12 };
		}
		let chartUid = 0;
		/**
		 * Hand-drawn SVG line chart. `series`: [{values, color}]. Renders an area
		 * fill under the first series, optional faint gridlines, and keeps a
		 * uniform stroke via vector-effect under non-uniform scaling.
		 */
		function Sparkline(props) {
			const { series, height = 60, zeroBase = true, grid = true } = props;
			const gradientId = "dnd-chart-" + (++chartUid);
			const domain = domainOf(series, zeroBase);
			const gridY = [CHART_PAD_Y, CHART_H / 2, CHART_H - CHART_PAD_Y];
			const primary = series[0];
			const areaSegments = primary ? seriesSegments(primary.values, domain.min, domain.max) : [];
			return h("svg", {
				viewBox: "0 0 " + CHART_W + " " + CHART_H,
				preserveAspectRatio: "none",
				style: { display: "block", width: "100%", height: height + "px" },
				"aria-hidden": true
			},
				h("defs", null,
					h("linearGradient", { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 },
						h("stop", { offset: "0%", stopColor: primary ? primary.color : "currentColor", stopOpacity: 0.2 }),
						h("stop", { offset: "100%", stopColor: primary ? primary.color : "currentColor", stopOpacity: 0 })
					)
				),
				grid
					? gridY.map((y, index) => h("line", {
						key: index, x1: 0, x2: CHART_W, y1: y, y2: y,
						stroke: "var(--dsw-alias-border-l1)", strokeWidth: 1,
						style: { vectorEffect: "non-scaling-stroke" }
					}))
					: null,
				primary && areaSegments.length > 0
					? areaSegments.map((path, index) => h("path", {
						key: "a" + index, d: path + " L" + CHART_W + "," + CHART_H + " L0," + CHART_H + " Z",
						fill: "url(#" + gradientId + ")", stroke: "none"
					}))
					: null,
				series.map((entry, seriesIndex) => seriesSegments(entry.values, domain.min, domain.max).map((path, segmentIndex) => h("path", {
					key: seriesIndex + "-" + segmentIndex,
					d: path,
					fill: "none",
					stroke: entry.color,
					strokeWidth: 1.6,
					strokeLinejoin: "round",
					strokeLinecap: "round",
					style: { vectorEffect: "non-scaling-stroke" }
				})))
			);
		}
		//#endregion
		//#region src/client/ui.js
		const { createElement: h, useCallback, useEffect, useRef, useState } = react;
		/** Stroke props shared with the shell's outline icon set. */
		const GLYPH_PROPS = {
			viewBox: "0 0 16 16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 1.5,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": true
		};
		/** The sidebar glyph: a pulse/heartbeat line. */
		function PanelIcon(props) {
			const size = props && typeof props.size === "number" ? props.size : 18;
			return h("svg", { ...GLYPH_PROPS, width: size, height: size },
				h("path", { d: "M1.5 8h2.6l1.7-4.2 2.9 8.4 1.9-4.2h3.9" })
			);
		}
		/** The header refresh glyph. */
		function RefreshGlyph() {
			return h("svg", { ...GLYPH_PROPS, width: 15, height: 15 },
				h("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3" })
			);
		}
		/** The disclosure chevron. */
		function ChevronGlyph() {
			return h("svg", { ...GLYPH_PROPS, width: 11, height: 11, className: "dnd-chevron" },
				h("path", { d: "M4 6.5l4 4 4-4" })
			);
		}
		/** One key/value row. */
		function KvRow(props) {
			return h("div", { className: "dnd-kv-row" },
				h("span", { className: "dnd-kv-key" }, props.label),
				h("span", { className: "dnd-kv-val", "data-dim": props.dim === true }, props.value ?? "—")
			);
		}
		/**
		 * Section card wrapper with a "详情" disclosure. `children` is the
		 * always-visible key content; `details` renders only while expanded.
		 */
		function Card(props) {
			const [open, setOpen] = useState(false);
			const details = props.details ?? null;
			return h("div", { className: "dnd-card", "data-open": open },
				h("div", { className: "dnd-card-head" },
					h("h3", { className: "dnd-card-title" }, props.title),
					props.extra ? h("span", { className: "dnd-card-extra" }, props.extra) : null,
					details
						? h("button", {
							type: "button",
							className: "dnd-detail-btn",
							"aria-expanded": open,
							onClick: () => setOpen((value) => !value)
						},
							h("span", null, open ? props.t("collapse") : props.t("details")),
							h(ChevronGlyph)
						)
						: null
				),
				props.children,
				details && open ? h("div", { className: "dnd-details" }, details) : null
			);
		}
		/** State color mapping for the session breakdown. */
		const STATE_COLORS = {
			ESTABLISHED: "var(--dsw-alias-state-business-primary)",
			LISTEN: "var(--dsw-alias-state-success-primary)",
			TIME_WAIT: "var(--dsw-alias-state-warn-primary)",
			CLOSE_WAIT: "var(--dsw-alias-state-error-primary)",
			SYN_SENT: "var(--dsw-alias-state-warn-primary)",
			FIN_WAIT_2: "var(--dsw-alias-state-idle-primary)"
		};
		/** One inline rate tile of the KPI strip. */
		function Kpi(props) {
			return h("div", { className: "dnd-kpi", "data-bad": props.bad === true },
				h("span", { className: "dnd-kpi-label" }, props.label),
				h("span", { className: "dnd-kpi-value", "data-dir": props.dir ?? "" }, props.value),
				props.sub ? h("span", { className: "dnd-kpi-sub" }, props.sub) : null
			);
		}
		/**
		 * The always-visible KPI strip: the four numbers that answer "how is the
		 * network right now" — download rate, upload rate, gateway latency and
		 * TCP session count.
		 */
		function KpiStrip({ snapshot, t }) {
			const totals = snapshot.traffic && snapshot.traffic.totals ? snapshot.traffic.totals : { irate: null, orate: null };
			const sessions = snapshot.sessions ?? { tcpTotal: 0, udpTotal: 0 };
			const latency = snapshot.latency ?? [];
			const gateway = latency.find((item) => item.role === "gateway") ?? latency[0] ?? null;
			const downValues = history.down.filter((value) => value != null);
			const upValues = history.up.filter((value) => value != null);
			const peakDown = downValues.length > 0 ? Math.max(...downValues) : null;
			const peakUp = upValues.length > 0 ? Math.max(...upValues) : null;
			const lossBad = gateway !== null && typeof gateway.lossPct === "number" && gateway.lossPct >= 5;
			return h("div", { className: "dnd-kpis" },
				h(Kpi, { label: t("down"), value: formatRate(totals.irate), sub: t("peak") + " " + formatRate(peakDown), dir: "down" }),
				h(Kpi, { label: t("up"), value: formatRate(totals.orate), sub: t("peak") + " " + formatRate(peakUp), dir: "up" }),
				h(Kpi, {
					label: t("kpi.latency"),
					value: gateway === null ? "—" : formatMs(gateway.last),
					sub: gateway === null || gateway.lossPct == null ? t("loss") + " —" : t("loss") + " " + gateway.lossPct + "%",
					bad: lossBad
				}),
				h(Kpi, { label: t("kpi.sessions"), value: String(sessions.tcpTotal ?? 0), sub: t("udpSockets") + " " + String(sessions.udpTotal ?? 0) })
			);
		}
		/** The live traffic card: down/up rate curves, per-interface details. */
		function TrafficCard({ snapshot, t }) {
			const totals = snapshot.traffic && snapshot.traffic.totals ? snapshot.traffic.totals : { irate: null, orate: null };
			const downValues = history.down.filter((value) => value != null);
			const upValues = history.up.filter((value) => value != null);
			const peakDown = downValues.length > 0 ? Math.max(...downValues) : null;
			const peakUp = upValues.length > 0 ? Math.max(...upValues) : null;
			const perInterface = ((snapshot.traffic && snapshot.traffic.perInterface) ?? [])
				.filter((entry) => !entry.loopback && ((entry.irate ?? 0) > 0 || (entry.orate ?? 0) > 0));
			const totalIn = ((snapshot.traffic && snapshot.traffic.perInterface) ?? [])
				.filter((entry) => !entry.loopback)
				.reduce((acc, entry) => acc + (entry.ibytes ?? 0), 0);
			const totalOut = ((snapshot.traffic && snapshot.traffic.perInterface) ?? [])
				.filter((entry) => !entry.loopback)
				.reduce((acc, entry) => acc + (entry.obytes ?? 0), 0);
			const details = h("div", { className: "dnd-details-inner" },
				h("div", { className: "dnd-subhead" }, t("traffic.byInterface")),
				perInterface.length > 0
					? h("div", { className: "dnd-kv" },
						perInterface.map((entry) => h(KvRow, {
							key: entry.name,
							label: entry.name,
							value: "↓" + formatRate(entry.irate) + "   ↑" + formatRate(entry.orate)
						}))
					)
					: h("div", { className: "dnd-note" }, t("traffic.noTraffic")),
				h("div", { className: "dnd-subhead" }, t("totalBytes")),
				h("div", { className: "dnd-kv" },
					h(KvRow, { label: "↓", value: formatBytes(totalIn) }),
					h(KvRow, { label: "↑", value: formatBytes(totalOut) })
				)
			);
			return h(Card, {
				title: t("section.traffic"),
				extra: clockOf(snapshot.ts),
				t,
				details
			},
				h("div", { className: "dnd-series-list" },
					h("div", { className: "dnd-series" },
						h("div", { className: "dnd-series-head" },
							h("span", { className: "dnd-series-label" }, t("down")),
							h("span", { className: "dnd-series-sub" }, t("peak") + " " + formatRate(peakDown))
						),
						h("div", { className: "dnd-series-value", "data-dir": "down" }, formatRate(totals.irate)),
						h(Sparkline, { series: [{ values: history.down, color: "var(--dsw-alias-state-business-primary)" }], height: 46, zeroBase: true })
					),
					h("div", { className: "dnd-series" },
						h("div", { className: "dnd-series-head" },
							h("span", { className: "dnd-series-label" }, t("up")),
							h("span", { className: "dnd-series-sub" }, t("peak") + " " + formatRate(peakUp))
						),
						h("div", { className: "dnd-series-value", "data-dir": "up" }, formatRate(totals.orate)),
						h(Sparkline, { series: [{ values: history.up, color: "var(--dsw-alias-state-warn-primary)" }], height: 46, zeroBase: true })
					)
				)
			);
		}
		/** The latency card: one compact live row per ping target. */
		function LatencyCard({ snapshot, t }) {
			const targets = snapshot.latency ?? [];
			if (targets.length === 0) {
				return h(Card, { title: t("section.latency"), t }, h("div", { className: "dnd-note" }, t("empty")));
			}
			const details = h("div", { className: "dnd-lat-details" },
				targets.map((target) => {
					const lossBad = typeof target.lossPct === "number" && target.lossPct >= 5;
					const label = target.role === "gateway"
						? t("latency.gateway", { target: target.target })
						: t("latency.target", { target: target.target });
					return h("div", { className: "dnd-lat-statblock", key: target.key },
						h("span", { className: "dnd-lat-statname" }, label),
						h("div", { className: "dnd-lat-stats" },
							h("span", null, t("avg") + " ", h("b", null, formatMs(target.avg))),
							h("span", null, t("min") + " ", h("b", null, formatMs(target.min))),
							h("span", null, t("max") + " ", h("b", null, formatMs(target.max))),
							typeof target.jitter === "number" ? h("span", null, t("jitter") + " ", h("b", null, formatMs(target.jitter))) : null,
							h("span", { "data-bad": lossBad }, t("loss") + " ", h("b", null, target.lossPct == null ? "—" : target.lossPct + "%")),
							h("span", null, t("sentReceived") + " ", h("b", null, String(target.received ?? 0) + "/" + String(target.sent ?? 0)))
						)
					);
				})
			);
			return h(Card, { title: t("section.latency"), t, details },
				h("div", { className: "dnd-lat-list" },
					targets.map((target) => {
						const lossBad = typeof target.lossPct === "number" && target.lossPct >= 5;
						const dead = target.last == null;
						const label = target.role === "gateway"
							? t("latency.gateway", { target: target.target })
							: t("latency.target", { target: target.target });
						return h("div", { className: "dnd-lat-row", key: target.key },
							h("span", { className: "dnd-lat-name", title: label }, label),
							h("span", { className: "dnd-lat-value", "data-dead": dead }, dead ? t("latency.dead") : formatMs(target.last)),
							h("span", { className: "dnd-loss-chip", "data-bad": lossBad }, target.lossPct == null ? "—" : target.lossPct + "%"),
							h("span", { className: "dnd-lat-chart" },
								h(Sparkline, {
									series: [{ values: target.samples ?? [], color: "var(--dsw-alias-state-business-primary)" }],
									height: 26,
									zeroBase: false,
									grid: false
								})
							)
						);
					})
				)
			);
		}
		/** One state bar row. */
		function StateBar({ entry, max }) {
			return h("div", { className: "dnd-bar-row" },
				h("span", { className: "dnd-bar-label", title: entry.state }, entry.state),
				h("span", { className: "dnd-bar-track" },
					h("span", {
						className: "dnd-bar-fill",
						style: {
							width: Math.max(4, Math.round((entry.count / max) * 100)) + "%",
							background: entry.color ?? STATE_COLORS[entry.state] ?? "var(--dsw-alias-state-business-primary)"
						}
					})
				),
				h("span", { className: "dnd-bar-count" }, String(entry.count))
			);
		}
		/** The sessions card: TCP/UDP totals, top state bars, trend on expand. */
		function SessionsCard({ snapshot, t }) {
			const sessions = snapshot.sessions ?? { tcpTotal: 0, udpTotal: 0, states: [] };
			const states = (sessions.states ?? []).slice();
			const top = states.slice(0, 3);
			const maxCount = states.reduce((acc, entry) => Math.max(acc, entry.count), 0) || 1;
			const details = h("div", { className: "dnd-details-inner" },
				h("div", { className: "dnd-subhead" }, t("states")),
				h("div", { className: "dnd-bars" },
					states.map((entry) => h(StateBar, { key: entry.state, entry, max: maxCount }))
				),
				h("div", { className: "dnd-subhead" }, t("session.trend")),
				h(Sparkline, { series: [{ values: history.sessions, color: "var(--dsw-alias-state-success-primary)" }], height: 38, zeroBase: false })
			);
			return h(Card, { title: t("section.sessions"), extra: clockOf(snapshot.ts), t, details },
				h("div", { className: "dnd-sess-top" },
					h("div", { className: "dnd-sess-big" },
						h("span", { className: "dnd-sess-num" }, String(sessions.tcpTotal ?? 0)),
						h("span", { className: "dnd-sess-label" }, t("tcpSessions")),
						h("span", { className: "dnd-sess-label" }, t("udpSockets") + " " + String(sessions.udpTotal ?? 0))
					),
					h("div", { className: "dnd-sess-bars" },
						top.map((entry) => h(StateBar, { key: entry.state, entry, max: maxCount }))
					)
				)
			);
		}
		/** Sorted interface list: primary first, then addressed, running, others. */
		function sortedInterfaces(snapshot) {
			const primaryName = snapshot.primary && snapshot.primary.interface;
			const interfaces = (snapshot.interfaces ?? []).filter((entry) => entry.name !== "lo0" || entry.ipv4.length > 0 || entry.ipv6.length > 0);
			return interfaces.slice().sort((left, right) => {
				const scoreOf = (entry) => (entry.name === primaryName ? 0 : (entry.ipv4.length > 0 ? 1 : (entry.running ? 2 : 3)));
				return scoreOf(left) - scoreOf(right) || left.name.localeCompare(right.name);
			});
		}
		/** One interface row for the expanded interface table. */
		function InterfaceRow({ entry, primaryName, rate, t }) {
			const isPrimary = entry.name === primaryName;
			const addresses = [
				...entry.ipv4.map((address) => ({ label: "IPv4", value: address })),
				...entry.ipv6.filter((address) => !address.startsWith("fe80:")).slice(0, 1).map((address) => ({ label: "IPv6", value: address }))
			];
			return h("div", { className: "dnd-iface-row", "data-dim": !entry.running || entry.name.startsWith("lo") },
				h("span", { className: "dnd-iface-name" },
					entry.name,
					isPrimary ? h("span", { className: "dnd-tag", "data-tone": "primary" }, t("primaryTag")) : null
				),
				h("span", { className: "dnd-iface-addr" },
					entry.mac ? h("span", { className: "dnd-iface-line" }, "MAC " + entry.mac) : null,
					addresses.length > 0
						? addresses.map((address) => h("span", { className: "dnd-iface-line", key: address.label }, address.label + " " + address.value))
						: entry.mac ? null : h("span", { className: "dnd-iface-line" }, "—")
				),
				h("span", { className: "dnd-iface-rate" },
					rate && (rate.irate != null || rate.orate != null)
						? "↓" + formatRate(rate.irate) + " ↑" + formatRate(rate.orate)
						: entry.loopback ? t("loopbackTag") : ""
				)
			);
		}
		/**
		 * The network card: the four identity facts (primary interface, gateway,
		 * DNS, public IP) stay visible; the full identity rows and the whole
		 * interface table live behind "详情".
		 */
		function NetworkCard({ snapshot, t }) {
			const primary = snapshot.primary ?? {};
			const wifi = snapshot.wifi;
			const wifiParts = [];
			if (wifi) {
				if (wifi.ssid) wifiParts.push(wifi.ssid);
				if (typeof wifi.rssi === "number") wifiParts.push(wifi.rssi + " dBm");
				if (typeof wifi.txRate === "number") wifiParts.push(wifi.txRate + " Mb/s");
				if (wifi.channel) wifiParts.push(wifi.channel);
			}
			const interfaces = sortedInterfaces(snapshot);
			const rateBy = new Map(((snapshot.traffic && snapshot.traffic.perInterface) ?? []).map((entry) => [entry.name, entry]));
			const detailRows = h("div", { className: "dnd-kv" },
				primary.ipv6 ? h(KvRow, { label: t("iface.ipv6"), value: primary.ipv6 }) : null,
				primary.mac ? h(KvRow, { label: t("iface.mac"), value: primary.mac }) : null,
				wifiParts.length > 0 ? h(KvRow, { label: t("wifi"), value: wifiParts.join(" · ") }) : null,
				h(KvRow, { label: t("hostname"), value: snapshot.hostname ?? "—", dim: true }),
				h(KvRow, { label: t("platform"), value: snapshot.platform ?? "—", dim: true }),
				snapshot.publicIp && snapshot.publicIp.location
					? h(KvRow, { label: t("location"), value: snapshot.publicIp.location, dim: true })
					: null
			);
			const details = h("div", { className: "dnd-details-inner" },
				detailRows,
				h("div", { className: "dnd-subhead" }, t("iface.title") + " · " + t("iface.count", { n: String(interfaces.length) })),
				h("div", { className: "dnd-iface-list" },
					interfaces.map((entry) => h(InterfaceRow, {
						key: entry.name,
						entry,
						primaryName: primary.interface,
						rate: rateBy.get(entry.name),
						t
					}))
				)
			);
			const publicIpText = snapshot.publicIp && snapshot.publicIp.ip ? snapshot.publicIp.ip : "—";
			return h(Card, { title: t("section.network"), t, details },
				h("div", { className: "dnd-net-grid" },
					h("div", { className: "dnd-net-item" },
						h("span", { className: "dnd-net-label" }, t("iface.primary")),
						h("span", { className: "dnd-net-value", "data-dim": primary.interface == null }, primary.interface ? primary.interface + " · " + (primary.ipv4 ?? "—") : "—")
					),
					h("div", { className: "dnd-net-item" },
						h("span", { className: "dnd-net-label" }, t("gateway")),
						h("span", { className: "dnd-net-value", "data-dim": primary.gateway == null }, primary.gateway ?? "—")
					),
					h("div", { className: "dnd-net-item" },
						h("span", { className: "dnd-net-label" }, t("dns")),
						h("span", { className: "dnd-net-value", "data-dim": (snapshot.dns ?? []).length === 0 }, (snapshot.dns ?? []).join(", ") || "—")
					),
					h("div", { className: "dnd-net-item" },
						h("span", { className: "dnd-net-label" }, t("publicIp")),
						h("span", { className: "dnd-net-value", "data-dim": publicIpText === "—" }, publicIpText)
					)
				)
			);
		}
		//#endregion
		//#region src/client/page.js
		/** localStorage-backed initial auto-refresh state. */
		function initialAuto() {
			try {
				return localStorage.getItem(AUTO_REFRESH_KEY) !== "0";
			} catch {
				return true;
			}
		}
		/**
		 * The dashboard page: header controls, the KPI strip, and the four
		 * cards. Polls the host snapshot every 3s while live and the page is
		 * visible; the manual refresh button works in both modes.
		 * @param props composed slot props carrying the bound translator
		 * @returns the dashboard element tree
		 */
		function DashboardPage(props) {
			const t = props.t;
			const [snapshot, setSnapshot] = useState(null);
			const [errorText, setErrorText] = useState("");
			const [refreshing, setRefreshing] = useState(false);
			const [auto, setAuto] = useState(initialAuto);
			const inFlight = useRef(false);
			const mountedRef = useRef(true);
			useEffect(() => () => {
				mountedRef.current = false;
			}, []);
			const load = useCallback(async () => {
				if (inFlight.current) return;
				inFlight.current = true;
				setRefreshing(true);
				try {
					const body = await fetchSnapshot();
					if (!mountedRef.current) return;
					setSnapshot(body);
					setErrorText("");
					recordSnapshot(body);
				} catch (error) {
					if (!mountedRef.current) return;
					setErrorText(error instanceof Error ? error.message : String(error));
				} finally {
					inFlight.current = false;
					if (mountedRef.current) setRefreshing(false);
				}
			}, []);
			// First paint: fetch once regardless of the live toggle.
			useEffect(() => {
				load();
			}, [load]);
			// Live loop: one self-scheduling timer; skips ticks while hidden.
			useEffect(() => {
				if (!auto) return;
				let cancelled = false;
				let timer = null;
				const tick = async () => {
					if (cancelled) return;
					if (typeof document === "undefined" || !document.hidden) await load();
					if (!cancelled) timer = setTimeout(tick, REFRESH_MS);
				};
				timer = setTimeout(tick, REFRESH_MS);
				return () => {
					cancelled = true;
					if (timer !== null) clearTimeout(timer);
				};
			}, [auto, load]);
			useEffect(() => {
				try {
					localStorage.setItem(AUTO_REFRESH_KEY, auto ? "1" : "0");
				} catch {}
			}, [auto]);
			const onToggleLive = useCallback(() => {
				setAuto((value) => !value);
			}, []);
			const empty = snapshot === null && errorText === "";
			return h("div", { className: "dnd-view" },
				h("div", { className: "dnd-header" },
					h("div", { className: "dnd-title-wrap" },
						h("h2", { className: "dnd-title" }, t("title")),
						h("span", { className: "dnd-subtitle" }, snapshot ? snapshot.hostname + " · " + t("subtitle") : t("subtitle"))
					),
					h("div", { className: "dnd-header-spacer" }),
					h("span", { className: "dnd-status" },
						h("span", { className: "dnd-status-dot", "data-live": auto && errorText === "", "data-err": errorText !== "" }),
						errorText !== "" ? t("loadError") : auto ? t("live") + " · 3s" : t("paused")
					),
					h("button", {
						type: "button",
						className: "dnd-live-toggle",
						onClick: onToggleLive,
						"aria-pressed": auto
					},
						h("span", { className: "dnd-switch", "data-on": auto }, h("span", { className: "dnd-switch-thumb" })),
						auto ? t("live") : t("paused")
					),
					h("button", {
						type: "button",
						className: "dnd-icon-button",
						title: t("manual"),
						"aria-label": t("manual"),
						"data-spin": refreshing,
						onClick: () => {
							load();
						}
					}, h(RefreshGlyph)),
					h("span", { className: "dnd-last-update" }, snapshot ? t("lastUpdate") + " " + clockOf(snapshot.ts) : "")
				),
				h("div", { className: "dnd-scroll" },
					errorText !== "" ? h("div", { className: "dnd-error" }, t("loadError") + "：" + errorText) : null,
					snapshot === null
						? (empty ? h("div", { className: "dnd-empty" }, t("empty")) : null)
						: h(react.Fragment, null,
							h(KpiStrip, { snapshot, t }),
							h("div", { className: "dnd-grid" },
								h(TrafficCard, { snapshot, t }),
								h(LatencyCard, { snapshot, t }),
								h(SessionsCard, { snapshot, t }),
								h(NetworkCard, { snapshot, t })
							)
						)
				)
			);
		}
		//#endregion
		//#region src/client/index.js
		/** Required services (cordis fiber inject waiting). */
		const inject = ["slots", "locale"];
		/**
		 * Mount the sidebar row and the dashboard page.
		 * @param ctx client root context (slots + locale services)
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			const tt = (key, params) => {
				let text = t(key);
				if (params) {
					for (const [name, value] of Object.entries(params)) text = text.split("{" + name + "}").join(value);
				}
				return text;
			};
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-net-dashboard: dictionaries");
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: PANEL_ORDER,
				label: () => tt("entry.label"),
				locale: NS
			}, PanelIcon)), "dsh-net-dashboard: sidebar entry");
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS,
				inject: () => ({ t: tt })
			}, DashboardPage)), "dsh-net-dashboard: dashboard page");
		}
		//#endregion
		exports.NS = NS;
		exports.PANEL_ID = PANEL_ID;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
