window.__ModuleLoader__.load({
	id: 'dsh-model-console',
	factory(require) {
		const React = require('react');
		const h = React.createElement;

		const NS = 'modelConsole';
		const PANEL_ID = 'model-console';
		// Idle-age buckets offered by the toolbar; '' means no age filter.
		const AGE_DAYS = [1, 3, 7, 14, 30, 90];

		/**
		 * Reference price book, USD per million tokens.
		 *
		 * The harness ships no pricing at all: `dsh-api-session-controller`'s
		 * `buildModelCatalog` returns only id/name/reasoning/badge, and
		 * `dsh-llm-pi-ai` states outright that it never reads cost metadata
		 * (`replay.ts` zeroes it). So the only honest way to put a number next to
		 * a model is a table that lives here, matched by provider first and by
		 * model id second — the same model id can bill differently at two gateways.
		 *
		 * Shape: [inputPerMTok, outputPerMTok, cacheReadPerMTok, cacheWritePerMTok].
		 * A missing cacheRead/cacheWrite entry falls back to a fraction of input,
		 * which is the usual discount (cache read ~10%, cache write ~125%).
		 */
		const PRICE = {
			// DeepSeek first-party list prices.
			'deepseek-v4-pro': [0.55, 2.19, 0.055, 0.69],
			'deepseek-v4': [0.27, 1.1, 0.027, 0.34],
			'deepseek-v4.1-flash': [0.1, 0.4, 0.01, 0.125],
			'deepseek-v4-flash': [0.1, 0.4, 0.01, 0.125],
			'deepseek-chat': [0.27, 1.1, 0.027, 0.34],
			'deepseek-reasoner': [0.55, 2.19, 0.055, 0.69],
			// Alibaba / Qwen line.
			'qwen-turbo': [0.05, 0.2, 0.005, 0.0625],
			'qwen3-235b-a22b': [0.28, 1.12, 0.028, 0.35],
			'qwen3-235b-a22b-instruct-2507': [0.28, 1.12, 0.028, 0.35],
			'qwen3-235b-a22b-thinking-2507': [0.28, 1.12, 0.028, 0.35],
			'qwen3-30b-a3b': [0.11, 0.45, 0.011, 0.14],
			'qwen3-coder-480b-a35b-instruct': [0.7, 2.8, 0.07, 0.875],
			'qwen3-vl-30b-a3b-thinking': [0.11, 0.45, 0.011, 0.14],
			'qwen-vl-max-2025-01-25': [0.41, 1.23, 0.041, 0.51],
			'qwen2.5-vl-72b-instruct': [0.41, 1.23, 0.041, 0.51],
			// ByteDance Doubao line.
			'doubao-1.5-pro-32k': [0.11, 0.28, 0.011, 0.14],
			'doubao-1.5-thinking-pro': [0.56, 2.24, 0.056, 0.7],
			'doubao-1.5-vision-pro': [0.42, 1.26, 0.042, 0.53],
			'doubao-seed-1.6': [0.11, 1.1, 0.011, 0.14],
			'doubao-seed-1.6-flash': [0.05, 0.22, 0.005, 0.0625],
			'doubao-seed-1.6-thinking': [0.11, 1.1, 0.011, 0.14],
			// Zhipu / Moonshot / Meituan.
			'glm-4.5': [0.6, 2.2, 0.06, 0.75],
			'glm-4.5-air': [0.2, 1.1, 0.02, 0.25],
			'glm-52-night-discount-202607': [0.6, 2.2, 0.06, 0.75],
			'kimi-k2': [0.6, 2.5, 0.06, 0.75],
			'kimi-k2-turbo': [0.6, 2.5, 0.06, 0.75],
			'meituan/longcat-flash-lite': [0.1, 0.4, 0.01, 0.125],
			// WorkBuddy routes bill in credits, not dollars; the panel still shows a
			// per-token estimate so a mixed-model list reads consistently.
			'hy4free': [0, 0, 0, 0],
			'hy4std': [0.29, 0.29, 0.029, 0.36],
			'hy3free': [0, 0, 0, 0],
			'hy3std': [0.29, 0.29, 0.029, 0.36],
			'gpt-pro': [2.5, 10, 0.25, 3.13]
		};

		/**
		 * Provider-level override: a gateway that resells someone else's weights
		 * bills at its own rate, so its rate wins over the model-id default.
		 */
		const PRICE_BY_PROVIDER = {
			'ohub': { 'deepseek-v4-pro': [0.55, 2.19, 0.055, 0.69], 'deepseek-v4.1-flash': [0.1, 0.4, 0.01, 0.125] },
			'xunnia': { 'deepseek-v4-flash': [0.1, 0.4, 0.01, 0.125], 'deepseek-v4.1-flash': [0.1, 0.4, 0.01, 0.125] },
			'qnaigc': { 'deepseek-v4.1-flash': [0.1, 0.4, 0.01, 0.125] }
		};

		/** [input, output, cacheRead, cacheWrite] for one route, or null. */
		function priceOf(provider, model) {
			const byProvider = PRICE_BY_PROVIDER[provider];
			const direct = byProvider && byProvider[model];
			const hit = direct || PRICE[model];
			return hit || null;
		}

		/** "$0.10" style, dropping trailing zeros so a column of numbers stays narrow. */
		function moneyText(value) {
			if (value === 0) return '$0';
			if (value < 0.01) return '$' + value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
			return '$' + value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
		}

		/** Human token counts: 1.2k / 3.4M so a wide number does not push the row. */
		function tokenText(count) {
			if (!Number.isFinite(count) || count <= 0) return '0';
			if (count < 1000) return String(count);
			if (count < 1000000) return (count / 1000).toFixed(count < 10000 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '') + 'k';
			return (count / 1000000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M';
		}

		/**
		 * Token totals for one conversation, read off the `tokenUsage` projection.
		 * That projection is a summary key, so `session.list` already carries it and
		 * no extra RPC is needed. Cold sessions whose cache missed simply have no
		 * entry; they report null instead of a fake zero.
		 */
		function usageOf(item) {
			const values = item.projections && item.projections.values;
			const usage = values && values.tokenUsage;
			if (!usage || typeof usage !== 'object') return null;
			const input = Number(usage.uncachedInputTokens) || 0;
			const output = Number(usage.outputTokens) || 0;
			const cacheRead = Number(usage.cacheReadTokens) || 0;
			const cacheWrite = Number(usage.cacheWriteTokens) || 0;
			const total = input + output + cacheRead + cacheWrite;
			if (total === 0) return null;
			return { input, output, cacheRead, cacheWrite, total };
		}

		/** Estimated spend in USD, or null when the route has no reference price. */
		function costOf(usage, provider, model) {
			if (!usage) return null;
			const price = priceOf(provider, model);
			if (!price) return null;
			const rate = (index, fallbackFactor) => {
				const value = price[index];
				return typeof value === 'number' ? value : price[0] * fallbackFactor;
			};
			const perMillion =
				(usage.input * rate(0, 1) +
					usage.output * rate(1, 4) +
					usage.cacheRead * rate(2, 0.1) +
					usage.cacheWrite * rate(3, 1.25));
			return perMillion / 1000000;
		}


		/**
		 * One probe result per provider route. A lamp is a fact about the route, not
		 * about a model: one listing request answers for every model behind it.
		 */
		function lampOf(pings, provider) {
			const entry = pings && provider ? pings[provider] : null;
			if (!entry) return { state: 'idle', text: '' };
			if (entry.state === 'busy') return { state: 'busy', text: '' };
			if (entry.state === 'ok') {
				return { state: 'ok', text: entry.ms === null ? '' : entry.ms + ' ms', ms: entry.ms };
			}
			return { state: 'bad', text: '', message: entry.message || null, ms: entry.ms };
		}

		/** Row caption: the route's round trip, or nothing until the probe ran. */
		function probeTextOf(pings, provider, t) {
			const entry = pings && provider ? pings[provider] : null;
			if (!entry) return '';
			if (entry.state === 'busy') return t('probing');
			if (entry.state === 'ok' && typeof entry.ms === 'number') return format(t('probeOk'), { ms: entry.ms });
			if (entry.state === 'bad') return t('probeFail');
			return '';
		}

		const zh = {
			panel: '模型控制台',
			title: '模型控制台',
			intro: '一次性切换所有对话的模型，也能单独改某一个对话。',
			refresh: '刷新',
			globalTitle: '统一设置',
			globalHint: '选好模型后，可以一键应用到下面每一个对话。',
			applyAll: '应用到所有对话',
			applying: '正在应用…',
			applyingProgress: '正在应用 {done}/{total}…',
			sessionsTitle: '对话列表',
			sessionCount: '共 {count} 个对话',
			apply: '应用',
			applied: '已应用',
			empty: '还没有任何对话。',
			model: '模型',
			effortDefault: '默认',
			current: '当前',
			untitled: '未命名对话',
			noModel: '未记录',
			pick: '选择模型',
			searchModel: '搜索模型或服务商…',
			searchSession: '搜索对话…',
			noMatch: '没有匹配的模型。',
			noSessionMatch: '没有匹配的对话。',
			close: '关闭',
			loadingCatalog: '正在读取模型目录…',
			catalogFailed: '模型目录读取失败：{message}',
			applyFailed: '应用失败：{message}',
			applySummary: '成功 {ok} 个，失败 {fail} 个。',
			applyAllOk: '已应用到 {ok} 个对话。',
			skipped: '（{count} 个已经是这个模型，跳过）',
			subagent: '子会话',
			running: '运行中',
			catalogFailures: '部分服务商读取失败：{message}',
			subagentShow: '展开子代理',
			subagentHide: '收起子代理',
			subagentCount: '{count} 个子代理',
			ageLabel: '使用时间',
			ageAll: '全部时间',
			ageDays: '{days} 天以上没用过',
			ageJustNow: '刚刚',
			ageMinutes: '{n} 分钟前',
			ageHours: '{n} 小时前',
			ageDaysAgo: '{n} 天前',
			selectAll: '全选',
			selectNone: '清空',
			selectedCount: '已选 {count} 个',
			bulkArchive: '批量归档',
			bulkUnarchive: '批量释放',
			bulkArchiveProgress: '正在归档 {done}/{total}…',
			bulkReleaseProgress: '正在释放 {done}/{total}…',
			bulkArchiveOk: '已归档 {ok} 个对话。',
			bulkReleaseOk: '已释放 {ok} 个对话。',
			bulkSummary: '成功 {ok} 个，失败 {fail} 个。',
			archivedShow: '展开已归档',
			archivedHide: '收起已归档',
			archivedCount: '{count} 个已归档',
			archivedHint: '归档的对话收在这里，勾选后点「批量释放」就能恢复。',
			noAgeMatch: '这个时间段没有对话。',
			usageTitle: '用量与花费',
			usageTokens: '{tokens} tok',
			usageCost: '≈ {cost}',
			usageDetail: '输入 {in} · 输出 {out} · 缓存读 {cacheRead} · 缓存写 {cacheWrite}',
			usageTotal: '合计 {tokens} tok · ≈ {cost}',
			usageTotalTokens: '合计 {tokens} tok',
			usageNote: '用量来自会话用量投影，花费按内置参考价估算，不等于账单。',
			pricePair: '{input} / {output}',
			priceHint: '参考价（美元 / 百万 token）：输入 / 输出',
			probe: '探活',
			probing: '探活中…',
			probeOk: '{ms} ms',
			probeFail: '不通',
			probeSummary: '探活完成：{ok} 个通，{fail} 个不通',
			probeNone: '没有可探活的 provider',
			probeHint: '逐个请求各 provider 的模型清单接口，只消耗网络达往，不产生 token 费用',
			lampIdle: '尚未探测',
		};

		const en = {
			panel: 'Model console',
			title: 'Model console',
			intro: 'Switch every conversation to one model at once, or change a single conversation.',
			refresh: 'Refresh',
			globalTitle: 'Apply to all',
			globalHint: 'Pick a model, then push it to every conversation below.',
			applyAll: 'Apply to all conversations',
			applying: 'Applying…',
			applyingProgress: 'Applying {done}/{total}…',
			sessionsTitle: 'Conversations',
			sessionCount: '{count} conversations',
			apply: 'Apply',
			applied: 'Applied',
			empty: 'No conversations yet.',
			model: 'Model',
			effortDefault: 'Default',
			current: 'Current',
			untitled: 'Untitled conversation',
			noModel: 'Not recorded',
			pick: 'Choose a model',
			searchModel: 'Search models or providers…',
			searchSession: 'Search conversations…',
			noMatch: 'No matching model.',
			noSessionMatch: 'No matching conversation.',
			close: 'Close',
			loadingCatalog: 'Reading the model catalog…',
			catalogFailed: 'The model catalog could not be read: {message}',
			applyFailed: 'Applying failed: {message}',
			applySummary: '{ok} succeeded, {fail} failed.',
			applyAllOk: 'Applied to {ok} conversations.',
			skipped: '({count} already on this model, skipped)',
			subagent: 'Subagent',
			running: 'Running',
			catalogFailures: 'Some providers could not be read: {message}',
			subagentShow: 'Show subagents',
			subagentHide: 'Hide subagents',
			subagentCount: '{count} subagents',
			ageLabel: 'Last used',
			ageAll: 'Any time',
			ageDays: 'Unused for {days}+ days',
			ageJustNow: 'just now',
			ageMinutes: '{n} min ago',
			ageHours: '{n} h ago',
			ageDaysAgo: '{n} d ago',
			selectAll: 'Select all',
			selectNone: 'Clear',
			selectedCount: '{count} selected',
			bulkArchive: 'Archive selected',
			bulkUnarchive: 'Release selected',
			bulkArchiveProgress: 'Archiving {done}/{total}…',
			bulkReleaseProgress: 'Releasing {done}/{total}…',
			bulkArchiveOk: 'Archived {ok} conversations.',
			bulkReleaseOk: 'Released {ok} conversations.',
			bulkSummary: '{ok} succeeded, {fail} failed.',
			archivedShow: 'Show archived',
			archivedHide: 'Hide archived',
			archivedCount: '{count} archived',
			archivedHint: 'Archived conversations live here — tick them and use "Release selected" to bring them back.',
			noAgeMatch: 'No conversations in this range.',
			usageTitle: 'Usage and spend',
			usageTokens: '{tokens} tok',
			usageCost: '≈ {cost}',
			usageDetail: 'In {in} · Out {out} · Cache read {cacheRead} · Cache write {cacheWrite}',
			usageTotal: '{tokens} tok total · ≈ {cost}',
			usageTotalTokens: '{tokens} tok total',
			usageNote: 'Usage comes from the session usage projection; spend is estimated from built-in reference prices, not a bill.',
			pricePair: '{input} / {output}',
			priceHint: 'Reference price (USD / million tokens): input / output',
			probe: 'Probe',
			probing: 'Probing…',
			probeOk: '{ms} ms',
			probeFail: 'down',
			probeSummary: 'Probe finished: {ok} up, {fail} down',
			probeNone: 'No provider can be probed',
			probeHint: 'Ask each provider for its model listing. This is one network round trip and costs no tokens.',
			lampIdle: 'Not probed yet',
		};

		const CSS = [
			'.mc-root{box-sizing:border-box;height:100%;overflow:auto;padding:24px 32px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px}',
			'.mc-head{display:flex;align-items:flex-start;gap:16px;margin-bottom:20px}',
			'.mc-title{margin:0 0 4px;font-size:20px;font-weight:600;line-height:28px}',
			'.mc-sub{color:var(--dsw-alias-label-secondary);font-size:13px}',
			'.mc-spacer{flex:1 1 auto}',
			'.mc-card{box-sizing:border-box;margin-bottom:16px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
			'.mc-card-title{margin:0 0 4px;font-size:14px;font-weight:600}',
			'.mc-card-hint{margin:0 0 12px;color:var(--dsw-alias-label-secondary);font-size:12px}',
			'.mc-row{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}',
			'.mc-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
			'.mc-label{color:var(--dsw-alias-label-secondary);font-size:12px}',
			'.mc-btn{height:32px;padding:0 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;white-space:nowrap}',
			'.mc-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}',
			'.mc-btn:disabled{opacity:.55;cursor:default}',
			'.mc-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}',
			'.mc-pick{display:inline-flex;align-items:center;gap:8px;height:32px;max-width:280px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;text-align:left}',
			'.mc-pick:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
			'.mc-pick:disabled{opacity:.55;cursor:default}',
			'.mc-pick-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mc-pick-caret{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:10px}',
			'.mc-effort{box-sizing:border-box;height:32px;max-width:120px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}',
			'.mc-input{box-sizing:border-box;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;min-width:220px}',
			'.mc-input:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
			'.mc-list{display:flex;flex-direction:column}',
			'.mc-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mc-item:first-child{border-top:0}',
			'.mc-item-child{padding-left:30px}',
			'.mc-check-slot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:20px}',
			'.mc-check{width:14px;height:14px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-brand-primary)}',
			'.mc-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}',
			'.mc-select{box-sizing:border-box;height:32px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}',
			'.mc-btn-sm{height:28px;padding:0 10px;font-size:12px}',
			'.mc-badge-warn{border-color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-border-l1));color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary))}',
			'.mc-item-archived{opacity:.55}',
			'.mc-item-archived:hover{opacity:.85}',
			'.mc-item-archived .mc-item-title{color:var(--dsw-alias-label-secondary)}',
			'.mc-toggle-archived{background:transparent;border-style:dashed}',
			'.mc-archived-hint{margin:6px 0 2px;color:var(--dsw-alias-label-secondary);font-size:12px}',
			'.mc-caret-slot{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:6px;min-width:36px}',
			'.mc-caret{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1;cursor:pointer}',
			'.mc-caret:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
			'.mc-item-main{flex:1 1 auto;min-width:0}',
			'.mc-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}',
			'.mc-item-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}',
			'.mc-badge{flex:0 0 auto;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px}',
			'.mc-error{color:var(--dsw-alias-state-error-primary);font-size:13px}',
			'.mc-ok{color:var(--dsw-alias-state-success-primary);font-size:13px}',
			'.mc-muted{padding:12px 0;color:var(--dsw-alias-label-secondary);font-size:13px}',
			'.mc-backdrop{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.32);display:flex;align-items:flex-start;justify-content:center;padding:72px 16px 16px}',
			'.mc-dialog{box-sizing:border-box;display:flex;flex-direction:column;width:min(560px,100%);max-height:min(560px,80vh);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(0,0,0,.32);overflow:hidden}',
			'.mc-dialog-head{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
			'.mc-dialog-body{flex:1 1 auto;overflow:auto;padding:6px 6px 10px}',
			'.mc-group{margin-top:8px;padding:12px 8px 6px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-size:15px;font-weight:700;letter-spacing:.02em;line-height:1.3}',
			'.mc-group:first-child{margin-top:0;padding-top:4px;border-top:0}',
			'.mc-group-count{margin-left:8px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:400}',
			'.mc-option{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;text-align:left;cursor:pointer}',
			'.mc-option:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.mc-option[data-active="true"]{background:var(--dsw-alias-bg-layer-2);font-weight:600}',
			'.mc-option-name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mc-option-price{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}',
			'.mc-lamp{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-border-l1);box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}',
			'.mc-lamp[data-state="ok"]{background:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,.2)}',
			'.mc-lamp[data-state="bad"]{background:#ef4444;box-shadow:0 0 0 2px rgba(239,68,68,.2)}',
			'.mc-lamp[data-state="busy"]{background:#94a3b8;animation:mc-pulse 1s ease-in-out infinite}',
			'@keyframes mc-pulse{0%,100%{opacity:.35}50%{opacity:1}}',
			'.mc-lamp-ms{margin-left:6px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:400;font-variant-numeric:tabular-nums}',
			'.mc-group-head{display:flex;align-items:center;gap:6px}',
			'.mc-usage{flex:0 0 auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}',
			'.mc-usage-tokens{color:var(--dsw-alias-label-primary)}',
			'.mc-usage-cost{padding:0 5px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;line-height:16px}',
			'.mc-option-mark{flex:0 0 auto;color:var(--dsw-alias-brand-primary);font-size:12px}',
			'.mc-divider{margin:14px 0 4px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mc-toggle{display:flex;align-items:center;gap:8px;width:100%;margin-top:12px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;text-align:left}',
			'.mc-toggle:hover{background:var(--dsw-alias-bg-layer-1)}',
			'.mc-toggle-caret{flex:0 0 auto;width:12px;color:var(--dsw-alias-label-secondary);font-size:10px}',
			'.mc-toggle-label{flex:1 1 auto;font-weight:600}',
			'.mc-toggle-count{flex:0 0 auto;color:var(--dsw-alias-label-secondary);font-size:12px}'
		].join('\n');

		function format(template, values) {
			return template.replace(/\{(\w+)\}/g, (whole, name) =>
				Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole
			);
		}

		function keyOf(provider, model) {
			return provider + '\u0000' + model;
		}

		/** Flatten the catalog once: pickers, labels and effort lookups all reuse it. */
		function buildIndex(catalog) {
			const rows = [];
			const byKey = new Map();
			const groups = [];
			for (const group of catalog.groups || []) {
				const bucket = { id: group.id, name: group.name || group.id, rows: [] };
				groups.push(bucket);
				for (const model of group.models || []) {
					const reasoning = model.reasoning || null;
					const row = {
						key: keyOf(group.id, model.id),
						provider: group.id,
						model: model.id,
						modelName: model.name || model.id,
						groupName: bucket.name,
						efforts: (reasoning && reasoning.efforts) || [],
						defaultEffort: reasoning && reasoning.defaultEffort,
						price: priceOf(group.id, model.id)
					};
					rows.push(row);
					byKey.set(row.key, row);
					bucket.rows.push(row);
				}
			}
			return { rows, byKey, groups };
		}

		function labelOf(byKey, selection) {
			if (!selection) return '';
			const row = byKey.get(keyOf(selection.provider, selection.model));
			return row ? row.modelName : selection.provider + '/' + selection.model;
		}

		function effortsOf(byKey, selection) {
			if (!selection) return [];
			const row = byKey.get(keyOf(selection.provider, selection.model));
			return row ? row.efforts : [];
		}

		function sameSelection(a, b) {
			if (!a || !b) return false;
			return (
				a.provider === b.provider &&
				a.model === b.model &&
				(a.reasoningEffort || '') === (b.reasoningEffort || '')
			);
		}

		function recordedOf(item) {
			const values = item.projections && item.projections.values;
			if (!values || !values.modelSelection) return null;
			return values.modelSelection.next || values.modelSelection.lastUsed || null;
		}

		function titleOf(item) {
			const values = item.projections && item.projections.values;
			return (values && values.title) || (item.sessionId || '').slice(0, 8) || '';
		}

		/** Milliseconds since the conversation last did anything; Infinity when unknown. */
		function ageOf(item) {
			const stamp = typeof item.updatedAt === 'number' ? item.updatedAt : 0;
			if (!stamp) return Number.POSITIVE_INFINITY;
			return Math.max(0, Date.now() - stamp);
		}

		function ageTextOf(item, t) {
			const ms = ageOf(item);
			if (!Number.isFinite(ms)) return '';
			const minutes = Math.floor(ms / 60000);
			if (minutes < 1) return t('ageJustNow');
			if (minutes < 60) return format(t('ageMinutes'), { n: minutes });
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return format(t('ageHours'), { n: hours });
			return format(t('ageDaysAgo'), { n: Math.floor(hours / 24) });
		}

		/**
		 * One shared searchable picker. Rendering a native <select> per conversation
		 * means thousands of <option> nodes; this keeps the DOM at a few hundred.
		 */
		function ModelPickerOverlay(props) {
			const { index, current, onPick, onClose, t, pings } = props;
			const [query, setQuery] = React.useState('');
			const inputRef = React.useRef(null);

			React.useEffect(() => {
				if (inputRef.current) inputRef.current.focus();
			}, []);

			React.useEffect(() => {
				function onKey(event) {
					if (event.key === 'Escape') onClose();
				}
				document.addEventListener('keydown', onKey);
				return () => document.removeEventListener('keydown', onKey);
			}, [onClose]);

			const needle = query.trim().toLowerCase();
			const visible = React.useMemo(() => {
				const out = [];
				let total = 0;
				for (const group of index.groups) {
					const hits = [];
					for (const row of group.rows) {
						if (
							needle &&
							!row.modelName.toLowerCase().includes(needle) &&
							!row.groupName.toLowerCase().includes(needle) &&
							!row.model.toLowerCase().includes(needle)
						) {
							continue;
						}
						hits.push(row);
						total += 1;
						if (total >= 200) break;
					}
					if (hits.length) out.push({ id: group.id, name: group.name, rows: hits });
					if (total >= 200) break;
				}
				return out;
			}, [index, needle]);

			return h(
				'div',
				{
					className: 'mc-backdrop',
					onMouseDown(event) {
						if (event.target === event.currentTarget) onClose();
					}
				},
				h(
					'div',
					{ className: 'mc-dialog' },
					h(
						'div',
						{ className: 'mc-dialog-head' },
						h('input', {
							ref: inputRef,
							className: 'mc-input',
							style: { flex: '1 1 auto' },
							value: query,
							placeholder: t('searchModel'),
							onChange(event) {
								setQuery(event.target.value);
							}
						}),
						h(
							'button',
							{ type: 'button', className: 'mc-btn', onClick: onClose },
							t('close')
						)
					),
					h(
						'div',
						{ className: 'mc-dialog-body' },
						visible.length === 0
							? h('div', { className: 'mc-muted' }, t('noMatch'))
							: visible.map((group) =>
									h(
										React.Fragment,
										{ key: group.id },
										h(
											'div',
											{ className: 'mc-group' },
											h(
												'div',
												{ className: 'mc-group-head' },
												h('span', { className: 'mc-lamp', 'data-state': lampOf(pings, group.id).state, title: lampOf(pings, group.id).message || (lampOf(pings, group.id).text || t('lampIdle')) }),
											group.name,
											h('span', { className: 'mc-group-count' }, '(' + group.rows.length + ')')	,
												lampOf(pings, group.id).text ? h('span', { className: 'mc-lamp-ms' }, lampOf(pings, group.id).text) : null
											)
										),
										group.rows.map((row) =>
											h(
												'button',
												{
													key: row.key,
													type: 'button',
													className: 'mc-option',
													'data-active':
														current &&
														current.provider === row.provider &&
														current.model === row.model
															? 'true'
															: 'false',
													onClick() {
														onPick(row);
													}
												},
												h('span', { className: 'mc-lamp', 'data-state': lampOf(pings, row.provider).state, title: lampOf(pings, row.provider).message || (lampOf(pings, row.provider).text || t('lampIdle')) }),
												h('span', { className: 'mc-option-name' }, row.modelName),
												row.price
													? h(
															'span',
															{ className: 'mc-option-price', title: t('priceHint') },
															format(t('pricePair'), {
																input: moneyText(row.price[0]),
																output: moneyText(row.price[1])
															})
														)
													: null,
												current &&
												current.provider === row.provider &&
												current.model === row.model
													? h('span', { className: 'mc-option-mark' }, '✓')
													: null
											)
										)
									)
								)
					)
				)
			);
		}

		/**
		 * One conversation row. Handlers arrive stable from the page and take the
		 * session id, so React.memo can actually skip untouched rows.
		 */
		const SessionRow = React.memo(function SessionRow(props) {
			const {
				item,
				draft,
				current,
				busy,
				onOpen,
				onEffort,
				onApply,
				byKey,
				t,
				childCount,
				open,
				onToggle,
				childState,
				nested,
				selected,
				onSelect,
				archived,
				pings
			} = props;
			const draftEfforts = effortsOf(byKey, draft);
			const sessionId = item.sessionId;
			const age = ageTextOf(item, t);
			// A lamp belongs to the route this row currently runs on, not to every route.
			const probe = probeTextOf(pings, current && current.provider, t);
			// Usage rides on the row's own projection: no extra RPC, no polling.
			const usage = usageOf(item);
			const cost = usage ? costOf(usage, current && current.provider, current && current.model) : null;
			// Archived rows stay legible but visually recede, so the live list owns attention.
			const rowClass = 'mc-item' + (nested ? ' mc-item-child' : '') + (archived ? ' mc-item-archived' : '');
			return h(
				'div',
				{ className: rowClass },
				h(
					'div',
					{ className: 'mc-check-slot' },
					h('input', {
						className: 'mc-check',
						type: 'checkbox',
						checked: selected === true,
						// `indeterminate` is a DOM property, not an attribute; the class carries
						// the visual state so a render-only harness can assert it too.
						'data-child-state': childState === true ? 'all' : childState === 'some' ? 'some' : null,
						'aria-label': titleOf(item) || t('untitled'),
						onChange() {
							onSelect(sessionId);
						},
						ref(node) {
							if (node) node.indeterminate = childState === 'some';
						}
					})
				),
				h(
					'div',
					{ className: 'mc-caret-slot' },
					h('span', {
						className: 'mc-lamp',
						'data-state': lampOf(pings, current && current.provider).state,
						title: lampOf(pings, current && current.provider).message || (lampOf(pings, current && current.provider).text || t('lampIdle'))
					}),
					childCount > 0
						? h(
								'button',
								{
									type: 'button',
									className: 'mc-caret',
									'aria-expanded': open ? 'true' : 'false',
									title: format(t('subagentCount'), { count: childCount }),
									onClick() {
										onToggle(sessionId);
									}
								},
								(open ? '▾' : '▸') + ' ' + childCount
							)
						: null
				),
				h(
					'div',
					{ className: 'mc-item-main' },
					h('div', { className: 'mc-item-title' }, titleOf(item) || t('untitled')),
					h(
						'div',
						{ className: 'mc-item-sub' },
						t('current') +
							': ' +
							(current ? labelOf(byKey, current) : t('noModel')) +
							(age ? ' · ' + age : '') +
							(usage ? ' · ' + format(t('usageTokens'), { tokens: tokenText(usage.total) }) : '') +
							(probe ? ' · ' + probe : '')
					)
				),
				usage
					? h(
							'div',
							{
								className: 'mc-usage',
								title: format(t('usageDetail'), {
									in: tokenText(usage.input),
									out: tokenText(usage.output),
									cacheRead: tokenText(usage.cacheRead),
									cacheWrite: tokenText(usage.cacheWrite)
								})
							},
							h('span', { className: 'mc-usage-tokens' }, tokenText(usage.total) + ' tok'),
							cost === null
								? null
								: h('span', { className: 'mc-usage-cost' }, format(t('usageCost'), { cost: moneyText(cost) }))
						)
					: null,
				item.running ? h('span', { className: 'mc-badge' }, t('running')) : null,
				nested ? null : item.origin === 'subagent' ? h('span', { className: 'mc-badge' }, t('subagent')) : null,
				h(
					'button',
					{
						type: 'button',
						className: 'mc-pick',
						disabled: busy !== null,
						title: draft ? labelOf(byKey, draft) : t('pick'),
						onClick() {
							onOpen(sessionId);
						}
					},
					h(
						'span',
						{ className: 'mc-pick-text' },
						draft ? labelOf(byKey, draft) : t('pick')
					),
					h('span', { className: 'mc-pick-caret' }, '▾')
				),
				draftEfforts.length > 0
					? h(
							'select',
							{
								className: 'mc-effort',
								value: draft && draft.reasoningEffort ? draft.reasoningEffort : '',
								disabled: busy !== null,
								onChange(event) {
									onEffort(sessionId, event.target.value);
								}
							},
							h('option', { value: '' }, t('effortDefault')),
							draftEfforts.map((effort) =>
								h('option', { key: effort.id, value: effort.id }, effort.name)
							)
						)
					: null,
				h(
					'button',
					{
						type: 'button',
						className: 'mc-btn',
						disabled: busy !== null || !draft || sameSelection(draft, current),
						onClick() {
							onApply(sessionId);
						}
					},
					busy === sessionId ? t('applying') : t('apply')
				)
			);
		});

		function ModelConsolePage() {
			const [localeTick, setLocaleTick] = React.useState(0);
			React.useEffect(() => {
				if (!activeLocale || typeof activeLocale.subscribe !== 'function') return undefined;
				return activeLocale.subscribe(() => setLocaleTick((value) => value + 1));
			}, []);
			// Rebind only when the language actually changes, so row props stay stable.
			const t = React.useMemo(
				() => (activeLocale && typeof activeLocale.bind === 'function' ? activeLocale.bind(NS) : (key) => key),
				[localeTick]
			);
			const [index, setIndex] = React.useState(null);
			const [failures, setFailures] = React.useState([]);
			const [sessions, setSessions] = React.useState([]);
			const [status, setStatus] = React.useState('loading');
			const [error, setError] = React.useState(null);
			const [notice, setNotice] = React.useState(null);
			const [busy, setBusy] = React.useState(null);
			const [globalSelection, setGlobalSelection] = React.useState(null);
			const [drafts, setDrafts] = React.useState({});
			const [currents, setCurrents] = React.useState({});
			const [query, setQuery] = React.useState('');
			const [picker, setPicker] = React.useState(null);
			const [progress, setProgress] = React.useState(null);
			// Subagent conversations are numerous and rarely edited by hand, so each
			// conversation keeps its own subagents behind a collapsed branch.
			const [showSubagents, setShowSubagents] = React.useState(false);
			const [showArchived, setShowArchived] = React.useState(false);
			const [expanded, setExpanded] = React.useState({});
			const expandedRef = React.useRef({});
			// Age filter ('' = any time) plus the bulk-selection and archive sets.
			const [ageFilter, setAgeFilter] = React.useState('');
			const [selected, setSelected] = React.useState({});
			const selectedRef = React.useRef({});
			const [archived, setArchived] = React.useState({});
			const archivedRef = React.useRef({});
			// Probe results keyed by provider route, plus the provider -> settingsNs
			// directory a probe needs. Both stay empty until the user asks for a probe.
			const [pings, setPings] = React.useState({});
			const pingsRef = React.useRef({});
			const [providerNs, setProviderNs] = React.useState({});
			const [probing, setProbing] = React.useState(false);

			// Mirrors of the two per-session maps. Handlers read them instead of closing
			// over state, which keeps every row callback referentially stable.
			const draftsRef = React.useRef({});
			const currentsRef = React.useRef({});

			const byKey = index ? index.byKey : new Map();

			const load = React.useCallback(async () => {
				setStatus('loading');
				setError(null);
				// Capability probes run again here: a Host may have been restarted under us.
				probeCapabilities({ remote: ctxRemote(), workspaces: activeWorkspaces, uiWorkspace: activeUiWorkspace });
				try {
					const remote = ctxRemote();
					if (!remote.session || typeof remote.session.modelCatalog !== 'function') {
						throw new Error(
							typeof remote.session.list !== 'function'
								? 'remote.session is unavailable on this Host'
								: 'modelCatalog is unavailable on this Host'
						);
					}
					const [catalogResult, listResult] = await Promise.all([
						remote.session.modelCatalog(),
						remote.session.list({})
					]);
					if (!catalogResult || catalogResult.ok !== true) {
						throw new Error(
							(catalogResult && catalogResult.error && catalogResult.error.message) ||
								'catalog unavailable'
						);
					}
					if (!listResult || listResult.ok !== true) {
						throw new Error(
							(listResult && listResult.error && listResult.error.message) || 'list unavailable'
						);
					}
					const catalog = catalogResult.value || { groups: [], default: null, failures: [] };
					const items = (listResult.value && listResult.value.items) || [];
					const nextIndex = buildIndex(catalog);
					const fallback = catalog.default || null;

					const nextCurrents = {};
					const nextDrafts = {};
					for (const item of items) {
						const recorded = recordedOf(item);
						if (recorded) nextCurrents[item.sessionId] = recorded;
						const seed = recorded || fallback;
						if (seed) nextDrafts[item.sessionId] = seed;
					}

					setIndex(nextIndex);
					setFailures(catalog.failures || []);
					setSessions(items);
					currentsRef.current = nextCurrents;
					draftsRef.current = nextDrafts;
					setCurrents(nextCurrents);
					setDrafts(nextDrafts);
					setGlobalSelection(fallback);
					setStatus('ready');
				} catch (caught) {
					setStatus('error');
					setError(caught instanceof Error ? caught.message : String(caught));
				}
			}, []);

			React.useEffect(() => {
				load();
			}, [load]);

			/**
			 * Provider -> settings namespace. Each adapter registers one discovery
			 * namespace for all of its routes, so this map is what makes a probe possible
			 * without hard-coding any namespace name. A Host without the llm Remote, or
			 * without the directory, simply leaves the map empty.
			 */
			React.useEffect(() => {
				let cancelled = false;
				async function readDirectory() {
					const remote = activeRemote;
					if (!remote || !remote.llm || typeof remote.llm.listConfigurableProviders !== 'function') return;
					try {
						const answer = await remote.llm.listConfigurableProviders();
						if (cancelled || !answer || answer.ok !== true) return;
						const next = {};
						for (const entry of answer.value || []) {
							if (!entry || typeof entry.provider !== 'string') continue;
							if (typeof entry.settingsNs !== 'string' || entry.settingsNs.length === 0) continue;
							next[entry.provider] = entry.settingsNs;
						}
						if (!cancelled) setProviderNs(next);
					} catch (ignored) {
						/* the panel keeps working without probes */
					}
				}
				readDirectory();
				return () => {
					cancelled = true;
				};
			}, []);

			/**
			 * Mirror the Host archive set. The Workspace model already owns the live
			 * stream, so the panel only reads it instead of opening a second one.
			 */
			const syncArchived = React.useCallback(() => {
				const model = activeWorkspaces && activeWorkspaces.list;
				if (!model || typeof model.getSnapshot !== 'function') return;
				const snapshot = model.getSnapshot();
				const ids = (snapshot && snapshot.archivedSessionIds) || [];
				const next = {};
				for (const id of ids) next[id] = true;
				archivedRef.current = next;
				setArchived(next);
			}, []);

			React.useEffect(() => {
				syncArchived();
				const model = activeWorkspaces && activeWorkspaces.list;
				if (!model || typeof model.subscribe !== 'function') return undefined;
				return model.subscribe(syncArchived);
			}, [syncArchived]);

			/** Submit one selection; never throws, always reports the failure text. */
			const selectFor = React.useCallback(async (sessionId, selection) => {
				try {
					const session = ctxRemote().session;
					if (!session || typeof session.selectModel !== 'function') {
						return { ok: false, message: 'selectModel is unavailable on this Host' };
					}
					const result = await session.selectModel({
						sessionId,
						provider: selection.provider,
						model: selection.model,
						...(selection.reasoningEffort === undefined
							? {}
							: { reasoningEffort: selection.reasoningEffort })
					});
					if (result && result.ok === true) return { ok: true };
					const failure = result && result.error;
					return {
						ok: false,
						message: failure
							? String(failure.code || '') + ': ' + String(failure.message || '')
							: 'unknown'
					};
				} catch (caught) {
					return { ok: false, message: caught instanceof Error ? caught.message : String(caught) };
				}
			}, []);

			/**
			 * Apply one conversation. The selection is read from a ref-free snapshot so
			 * this callback stays stable and memoized rows are not invalidated.
			 */
			const applyOne = React.useCallback(
				async (sessionId) => {
					const selection = draftsRef.current[sessionId];
					if (!selection) return;
					setBusy(sessionId);
					setNotice(null);
					const outcome = await selectFor(sessionId, selection);
					setBusy(null);
					if (outcome.ok) {
						currentsRef.current = { ...currentsRef.current, [sessionId]: selection };
						setCurrents(currentsRef.current);
						setNotice({ kind: 'ok', text: t('applied') });
					} else {
						setNotice({ kind: 'error', text: format(t('applyFailed'), { message: outcome.message }) });
					}
				},
				[selectFor, t]
			);

			/**
			 * Push one selection to every conversation. Four in flight at a time keeps
			 * the Host responsive: each call resolves a Session agent, and doing that
			 * ninety-nine times back to back is what froze the window.
			 */
			const applyAll = React.useCallback(async () => {
				const target = globalSelection;
				if (!target) return;
				setBusy('all');
				setNotice(null);

				const pending = sessions.filter(
					(item) => !sameSelection(currentsRef.current[item.sessionId], target)
				);
				const skipped = sessions.length - pending.length;
				const applied = {};
				let ok = 0;
				let done = 0;
				const problems = [];
				let cursor = 0;
				setProgress({ done: 0, total: pending.length });

				async function worker() {
					for (;;) {
						const position = cursor;
						cursor += 1;
						if (position >= pending.length) return;
						const item = pending[position];
						const outcome = await selectFor(item.sessionId, target);
						if (outcome.ok) {
							ok += 1;
							applied[item.sessionId] = target;
						} else {
							problems.push(outcome.message);
						}
						done += 1;
						setProgress({ done, total: pending.length });
					}
				}

				const lanes = Math.min(4, pending.length);
				const workers = [];
				for (let lane = 0; lane < lanes; lane += 1) workers.push(worker());
				await Promise.all(workers);
				setProgress(null);

				if (ok > 0) {
					currentsRef.current = { ...currentsRef.current, ...applied };
					draftsRef.current = { ...draftsRef.current, ...applied };
					setCurrents(currentsRef.current);
					setDrafts(draftsRef.current);
				}
				setBusy(null);
				const tail = skipped > 0 ? ' ' + format(t('skipped'), { count: skipped }) : '';
				setNotice({
					kind: problems.length === 0 ? 'ok' : 'error',
					text:
						problems.length === 0
							? format(t('applyAllOk'), { ok }) + tail
							: format(t('applySummary'), { ok, fail: problems.length }) +
								' ' +
								problems.slice(0, 3).join('; ')
				});
			}, [globalSelection, sessions, selectFor, t]);

			const setDraft = React.useCallback((sessionId, selection) => {
				draftsRef.current = { ...draftsRef.current, [sessionId]: selection };
				setDrafts(draftsRef.current);
			}, []);

			const openPicker = React.useCallback((target) => {
				setPicker(target);
			}, []);

			const toggleChildren = React.useCallback((sessionId) => {
				const next = { ...expandedRef.current };
				if (next[sessionId]) delete next[sessionId];
				else next[sessionId] = true;
				expandedRef.current = next;
				setExpanded(next);
			}, []);

			/** Select or deselect a whole branch at once (a row plus its subagents). */
			const toggleGroup = React.useCallback((sessionIds) => {
				const next = { ...selectedRef.current };
				const allOn = sessionIds.every((id) => next[id] === true);
				for (const id of sessionIds) {
					if (allOn) delete next[id];
					else next[id] = true;
				}
				selectedRef.current = next;
				setSelected(next);
			}, []);

			const toggleSelect = React.useCallback((sessionId) => {
				const next = { ...selectedRef.current };
				if (next[sessionId]) delete next[sessionId];
				else next[sessionId] = true;
				selectedRef.current = next;
				setSelected(next);
			}, []);

			/**
			 * Ask every configured route for its model listing and time the round trip.
			 * A listing is a plain GET: it spends no tokens. Routes run one after another
			 * so a probe never turns into a burst of parallel requests against a provider.
			 */
			const pingAll = React.useCallback(async () => {
				const providers = Object.keys(providerNs);
				if (providers.length === 0) {
					setNotice({ kind: 'error', text: t('probeNone') });
					return;
				}
				setProbing(true);
				setNotice(null);
				const next = { ...pingsRef.current };
				for (const provider of providers) next[provider] = { state: 'busy', ms: null };
				pingsRef.current = next;
				setPings(next);
				let ok = 0;
				let fail = 0;
				for (const provider of providers) {
					const ns = providerNs[provider];
					const started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
					let entry;
					try {
						const answer = await activeRemote.llm.discoverModels(ns, { provider });
						const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - started;
						const ms = Math.max(0, Math.round(elapsed));
						if (answer && answer.ok === true) {
							// An empty listing still means the route answered; the lamp is about reachability.
							entry = { state: 'ok', ms };
							ok += 1;
						} else {
							entry = { state: 'bad', ms, message: (answer && answer.error && answer.error.message) || 'unknown' };
							fail += 1;
						}
					} catch (caught) {
						const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - started;
						entry = {
							state: 'bad',
							ms: Math.max(0, Math.round(elapsed)),
							message: caught instanceof Error ? caught.message : String(caught)
						};
						fail += 1;
					}
					next[provider] = entry;
					pingsRef.current = { ...next };
					setPings({ ...next });
				}
				setProbing(false);
				setNotice({ kind: fail === 0 ? 'ok' : 'error', text: format(t('probeSummary'), { ok, fail }) });
			}, [providerNs, t]);

			/** Archive (or release) every selected conversation, four lanes at a time. */
			const runBulk = React.useCallback(
				async (mode) => {
					const ids = Object.keys(selectedRef.current);
					if (ids.length === 0) return;
					const service = activeUiWorkspace || activeWorkspaces;
					if (!service) {
						setNotice({ kind: 'error', text: format(t('applyFailed'), { message: 'workspace service unavailable' }) });
						return;
					}
					// Probe the exact method this run needs; a Host may expose only one half.
					const method = mode === 'archive' ? 'archiveSession' : 'unarchiveSession';
					if (typeof service[method] !== 'function') {
						setNotice({
							kind: 'error',
							text: format(t('applyFailed'), { message: method + ' is unavailable on this Host' })
						});
						return;
					}
					setBusy('bulk');
					setNotice(null);
					const total = ids.length;
					let ok = 0;
					let done = 0;
					const problems = [];
					const failedIds = {};
					let cursor = 0;
					setProgress({ done: 0, total, mode });

					async function worker() {
						for (;;) {
							const position = cursor;
							cursor += 1;
							if (position >= total) return;
							const id = ids[position];
							try {
								if (mode === 'archive') await service.archiveSession(id, { stopActivity: true });
								else await service.unarchiveSession(id);
								ok += 1;
							} catch (caught) {
								failedIds[id] = true;
								problems.push(caught instanceof Error ? caught.message : String(caught));
							}
							done += 1;
							setProgress({ done, total, mode });
						}
					}

					const lanes = Math.min(4, total);
					const workers = [];
					for (let lane = 0; lane < lanes; lane += 1) workers.push(worker());
					await Promise.all(workers);
					setProgress(null);
					setBusy(null);

					// Releasing never leaves rows behind: the archived group closes once empty.
					if (mode === 'unarchive' && Object.keys(failedIds).length === 0) setShowArchived(false);
					// Only the failures stay selected, so a retry is one click away.
					selectedRef.current = failedIds;
					setSelected(failedIds);
					const tail =
						problems.length === 0
							? ''
							: ' ' + problems.slice(0, 3).join('; ');
					setNotice({
						kind: problems.length === 0 ? 'ok' : 'error',
						text:
							(problems.length === 0
								? format(mode === 'archive' ? t('bulkArchiveOk') : t('bulkReleaseOk'), { ok })
								: format(t('bulkSummary'), { ok, fail: problems.length })) + tail
					});
					syncArchived();
				},
				[syncArchived, t]
			);

			const closePicker = React.useCallback(() => {
				setPicker(null);
			}, []);

			const setEffort = React.useCallback(
				(sessionId, value) => {
					const base = draftsRef.current[sessionId];
					if (!base) return;
					const next = { provider: base.provider, model: base.model };
					if (value) next.reasoningEffort = value;
					setDraft(sessionId, next);
				},
				[setDraft]
			);

			const pickRow = React.useCallback(
				(row) => {
					const target = picker;
					setPicker(null);
					if (!target) return;
					// Only the provider/model pair is chosen here; leaving effort out keeps
					// the adapter default in charge until the effort select is used.
					const selection = { provider: row.provider, model: row.model };
					if (target === 'global') setGlobalSelection(selection);
					else setDraft(target, selection);
				},
				[picker, setDraft]
			);

			const filtered = React.useMemo(() => {
				const needle = query.trim().toLowerCase();
				const ageLimit = ageFilter ? Number(ageFilter) * 86400000 : 0;
				const match = (item) => {
					if (ageLimit && ageOf(item) < ageLimit) return false;
					if (!needle) return true;
					const title = titleOf(item).toLowerCase();
					if (title.includes(needle)) return true;
					const current = currents[item.sessionId];
					return current ? labelOf(byKey, current).toLowerCase().includes(needle) : false;
				};
				const known = new Set(sessions.map((item) => item.sessionId));
				const main = [];
				const childrenByParent = new Map();
				const orphans = [];
				// Archived conversations leave the live list entirely; they live in their
				// own collapsed group so the everyday list stays clean.
				const archivedItems = [];
				for (const item of sessions) {
					if (!match(item)) continue;
					if (archived[item.sessionId] === true) {
						archivedItems.push(item);
						continue;
					}
					if (item.origin !== 'subagent') {
						main.push(item);
						continue;
					}
					const parent = item.parentSessionId;
					if (parent && known.has(parent)) {
						const bucket = childrenByParent.get(parent);
						if (bucket) bucket.push(item);
						else childrenByParent.set(parent, [item]);
					} else {
						orphans.push(item);
					}
				}
				return { main, childrenByParent, orphans, archivedItems };
			}, [sessions, query, currents, byKey, ageFilter, archived]);

			// A search is an explicit "find it now", so it opens every collapsed branch.
			const autoOpen = query.trim().length > 0;
			const orphansVisible = showSubagents || autoOpen;
			const archivedVisible = showArchived || autoOpen;

			function renderRow(item, extra) {
				return h(SessionRow, {
					key: item.sessionId,
					item,
					draft: drafts[item.sessionId] || null,
					current: currents[item.sessionId] || null,
					busy,
					byKey,
					t,
					onOpen: openPicker,
					onEffort: setEffort,
					onApply: applyOne,
					childCount: 0,
					open: false,
					onToggle: toggleChildren,
					childState: null,
					nested: false,
					selected: selected[item.sessionId] === true,
					onSelect: toggleSelect,
					archived: archived[item.sessionId] === true,
					pings,
					...(extra || {})
				});
			}

			/** A main conversation renders its own subagents directly underneath. */
			function renderBranch(item) {
				const children = filtered.childrenByParent.get(item.sessionId) || [];
				const open = autoOpen || expanded[item.sessionId] === true;
				// The shaded state tells you hidden subagents ride along with this row.
				let childChecked = 0;
				for (const child of children) if (selected[child.sessionId] === true) childChecked += 1;
				const branchState =
					children.length === 0 || childChecked === 0
						? null
						: childChecked === children.length
							? true
							: 'some';
				// Ticking a parent takes its subagents with it, collapsed or not.
				const branchIds = [item.sessionId].concat(children.map((child) => child.sessionId));
				return h(
					React.Fragment,
					{ key: item.sessionId },
					renderRow(item, {
						childCount: children.length,
						open,
						childState: branchState,
						onSelect: () => toggleGroup(branchIds)
					}),
					open ? children.map((child) => renderRow(child, { nested: true })) : null
				);
			}

			const header = h(
				'div',
				{ className: 'mc-head' },
				h(
					'div',
					null,
					h('h1', { className: 'mc-title' }, t('title')),
					h('div', { className: 'mc-sub' }, t('intro'))
				),
				h('div', { className: 'mc-spacer' }),
				h(
					'button',
					{
						type: 'button',
						className: 'mc-btn',
						disabled: status === 'loading' || busy !== null,
						onClick: load
					},
					t('refresh')
				)
			);

			if (status === 'loading' && index === null) {
				return h(
					'div',
					{ className: 'mc-root' },
					h('style', null, CSS),
					header,
					h('div', { className: 'mc-muted' }, t('loadingCatalog'))
				);
			}

			if (status === 'error' && index === null) {
				return h(
					'div',
					{ className: 'mc-root' },
					h('style', null, CSS),
					header,
					h('div', { className: 'mc-error' }, format(t('catalogFailed'), { message: error }))
				);
			}

			const pickerCurrent =
				picker === 'global'
					? globalSelection
					: picker
						? drafts[picker] || null
						: null;

			// Ids the filter matched, so "select all" never reaches a filtered-out row.
			// Subagent rows count even while their branch is collapsed, otherwise a
			// time-based cleanup would silently leave every old subagent behind.
			const visibleIds = new Set();
			for (const item of filtered.main) {
				visibleIds.add(item.sessionId);
				for (const child of filtered.childrenByParent.get(item.sessionId) || []) {
					visibleIds.add(child.sessionId);
				}
			}
			for (const item of filtered.orphans) visibleIds.add(item.sessionId);
			// Archived rows are matched by the filter and merely collapsed, so a
			// selection made inside the archived group survives collapsing it.
			for (const item of filtered.archivedItems) visibleIds.add(item.sessionId);
			let selectedCount = 0;
			for (const id of Object.keys(selected)) if (visibleIds.has(id)) selectedCount += 1;

			// Fleet-wide usage. Every row already carries its own numbers; this is
			// the same sum without a second pass over the Host.
			let totalTokens = 0;
			let totalCost = 0;
			let anyUsage = false;
			let anyCost = false;
			for (const item of sessions) {
				const usage = usageOf(item);
				if (!usage) continue;
				anyUsage = true;
				totalTokens += usage.total;
				const current = currents[item.sessionId];
				const cost = current ? costOf(usage, current.provider, current.model) : null;
				if (cost !== null) {
					totalCost += cost;
					anyCost = true;
				}
			}

			return h(
				'div',
				{ className: 'mc-root' },
				h('style', null, CSS),
				header,
				h(
					'div',
					{ className: 'mc-card' },
					h('h2', { className: 'mc-card-title' }, t('globalTitle')),
					h('p', { className: 'mc-card-hint' }, t('globalHint')),
					h(
						'div',
						{ className: 'mc-row' },
						h(
							'div',
							{ className: 'mc-field' },
							h('span', { className: 'mc-label' }, t('model')),
							h(
								'button',
								{
									type: 'button',
									className: 'mc-pick',
									style: { minWidth: 220 },
									disabled: busy !== null,
									onClick: () => openPicker('global')
								},
								h(
									'span',
									{ className: 'mc-pick-text' },
									globalSelection ? labelOf(byKey, globalSelection) : t('pick')
								),
								h('span', { className: 'mc-pick-caret' }, '▾')
							)
						),
						h(
							'button',
							{
								type: 'button',
								className: 'mc-btn mc-btn-primary',
								disabled: busy !== null || !globalSelection || sessions.length === 0,
								onClick: applyAll
							},
							busy === 'all'
								? progress
									? format(t('applyingProgress'), progress)
									: t('applying')
								: t('applyAll')
						)
					),
					failures.length > 0
						? h(
								'div',
								{ className: 'mc-error', style: { marginTop: 8 } },
								format(t('catalogFailures'), {
									message: failures.map((f) => f.name + ': ' + f.message).join('; ')
								})
							)
						: null
				),
				notice
					? h(
							'div',
							{
								className: notice.kind === 'ok' ? 'mc-ok' : 'mc-error',
								style: { marginBottom: 12 }
							},
							notice.text
						)
					: null,
				anyUsage
					? h(
							'div',
							{ className: 'mc-card' },
							h(
								'div',
								{ className: 'mc-row', style: { alignItems: 'center', margin: 0 } },
								h('h2', { className: 'mc-card-title', style: { margin: 0 } }, t('usageTitle')),
								h('div', { className: 'mc-spacer' }),
								h(
									'span',
									{ className: 'mc-sub' },
									format(t(anyCost ? 'usageTotal' : 'usageTotalTokens'), {
										tokens: tokenText(totalTokens),
										cost: moneyText(totalCost)
									})
								)
							),
							h('p', { className: 'mc-card-hint', style: { margin: '6px 0 0' } }, t('usageNote'))
						)
					: null,
				h(
					'div',
					{ className: 'mc-card' },
					h(
						'div',
						{ className: 'mc-row', style: { marginBottom: 8, alignItems: 'center' } },
						h('h2', { className: 'mc-card-title', style: { margin: 0 } }, t('sessionsTitle')),
						h('input', {
							className: 'mc-input',
							value: query,
							placeholder: t('searchSession'),
							onChange(event) {
								setQuery(event.target.value);
							}
						}),
						h('div', { className: 'mc-spacer' }),
						h('span', { className: 'mc-sub' }, format(t('sessionCount'), { count: sessions.length }))
					),
					h(
						'div',
						{ className: 'mc-toolbar' },
						h(
							'select',
							{
								className: 'mc-select',
								value: ageFilter,
								'aria-label': t('ageLabel'),
								onChange(event) {
									setAgeFilter(event.target.value);
								}
							},
							h('option', { value: '' }, t('ageAll')),
							AGE_DAYS.map((days) =>
								h('option', { key: days, value: String(days) }, format(t('ageDays'), { days }))
							)
						),
						h(
							'button',
							{
								type: 'button',
								className: 'mc-btn mc-btn-sm',
								disabled: busy !== null,
								onClick() {
									const next = {};
									for (const item of sessions) {
										if (visibleIds.has(item.sessionId)) next[item.sessionId] = true;
									}
									selectedRef.current = next;
									setSelected(next);
								}
							},
							t('selectAll')
						),
						h(
							'button',
							{
								type: 'button',
								className: 'mc-btn mc-btn-sm',
								disabled: busy !== null || selectedCount === 0,
								onClick() {
									selectedRef.current = {};
									setSelected({});
								}
							},
							t('selectNone')
						),
						h('span', { className: 'mc-sub' }, format(t('selectedCount'), { count: selectedCount })),
						// Probing is user-initiated on purpose: a listing request is cheap but
						// nobody should be sending traffic to seven providers behind their back.
						caps.probe
							? h(
									'button',
									{
										type: 'button',
										className: 'mc-btn mc-btn-sm',
										disabled: probing || busy !== null,
										title: t('probeHint'),
										onClick() {
											pingAll();
										}
									},
									probing ? t('probing') : t('probe')
								)
							: null,
							h('div', { className: 'mc-spacer' }),
						// Archive half is optional: a Host without those RPCs loses the two
						// buttons and the archived group instead of failing every action.
						caps.archive
							? h(
									'button',
									{
										type: 'button',
										className: 'mc-btn mc-btn-sm',
										disabled: busy !== null || selectedCount === 0,
										onClick() {
											runBulk('archive');
										}
									},
									busy === 'bulk' && progress && progress.mode === 'archive'
										? format(t('bulkArchiveProgress'), progress)
										: t('bulkArchive')
								)
							: null,
						caps.archive
							? h(
									'button',
									{
										type: 'button',
										className: 'mc-btn mc-btn-sm',
										disabled: busy !== null || selectedCount === 0,
										onClick() {
											runBulk('unarchive');
										}
									},
									busy === 'bulk' && progress && progress.mode === 'unarchive'
										? format(t('bulkReleaseProgress'), progress)
										: t('bulkUnarchive')
								)
							: null
					),
					sessions.length === 0
						? h('div', { className: 'mc-muted' }, t('empty'))
						: filtered.main.length === 0 &&
								filtered.orphans.length === 0 &&
								(!caps.archive || filtered.archivedItems.length === 0)
							? h('div', { className: 'mc-muted' }, ageFilter ? t('noAgeMatch') : t('noSessionMatch'))
							: h(
									'div',
									{ className: 'mc-list' },
									filtered.main.map(renderBranch),
									filtered.orphans.length === 0
										? null
										: h(
												'div',
												null,
												h('div', { className: 'mc-divider' }),
												h(
													'button',
													{
														type: 'button',
														className: 'mc-toggle',
														'aria-expanded': orphansVisible ? 'true' : 'false',
														onClick() {
															setShowSubagents((value) => !value);
														}
													},
													h('span', { className: 'mc-toggle-caret' }, orphansVisible ? '▾' : '▸'),
													h(
														'span',
														{ className: 'mc-toggle-label' },
														orphansVisible ? t('subagentHide') : t('subagentShow')
													),
													h(
														'span',
														{ className: 'mc-toggle-count' },
														format(t('subagentCount'), { count: filtered.orphans.length })
													)
												),
												orphansVisible
													? filtered.orphans.map((item) => renderRow(item, { nested: true }))
													: null
											),
									!caps.archive || filtered.archivedItems.length === 0
										? null
										: h(
												'div',
												null,
												h('div', { className: 'mc-divider' }),
												h(
													'button',
													{
														type: 'button',
														className: 'mc-toggle mc-toggle-archived',
														'aria-expanded': archivedVisible ? 'true' : 'false',
														onClick() {
															setShowArchived((value) => !value);
														}
													},
													h('span', { className: 'mc-toggle-caret' }, archivedVisible ? '▾' : '▸'),
													h(
														'span',
														{ className: 'mc-toggle-label' },
														archivedVisible ? t('archivedHide') : t('archivedShow')
													),
													h(
														'span',
														{ className: 'mc-toggle-count' },
														format(t('archivedCount'), { count: filtered.archivedItems.length })
													)
												),
												archivedVisible
													? h(
															'div',
															null,
															h('div', { className: 'mc-archived-hint' }, t('archivedHint')),
															filtered.archivedItems.map((item) =>
																renderRow(item, { nested: true, archived: true })
															)
														)
													: null
											)
								)
				),
				picker
					? h(ModelPickerOverlay, {
							index,
							current: pickerCurrent,
							onPick: pickRow,
							onClose: closePicker,
							t,
							pings
						})
					: null
			);
		}

		function ConsolePanelIcon() {
			return h(
				'svg',
				{
					viewBox: '0 0 24 24',
					width: 20,
					height: 20,
					'aria-hidden': true,
					style: { display: 'block' }
				},
				h('rect', { x: 3, y: 4.5, width: 18, height: 2.6, rx: 1.3, fill: 'currentColor', opacity: 0.9 }),
				h('rect', { x: 3, y: 10.7, width: 18, height: 2.6, rx: 1.3, fill: 'currentColor', opacity: 0.6 }),
				h('rect', { x: 3, y: 16.9, width: 18, height: 2.6, rx: 1.3, fill: 'currentColor', opacity: 0.35 })
			);
		}

		/**
		 * Every capability the panel can use. Optional ones are probed at apply time so
		 * an older Host loses a feature instead of rendering a broken page.
		 */
		// Cordis reads an inject OBJECT's keys as service names, so `{required, optional}`
		// makes it wait for two services literally named "required"/"optional" and the
		// whole entry stays pending forever. A plain array is the safe form everywhere;
		// graceful degradation is done at runtime by probeCapabilities() instead.
		const inject = ['slots', 'locale', 'remote', 'remote.session', 'remote.llm', 'workspaces', 'uiWorkspace'];

		let activeRemote = null;
		let activeLocale = null;
		let activeWorkspaces = null;
		let activeUiWorkspace = null;

		// Capability flags resolved by probeCapabilities(); false hides the feature.
		const caps = { archive: false, catalog: false, picker: true, probe: false };

		function probeCapabilities(ctx) {
			const workspaces = ctx.workspaces || null;
			const uiWorkspace = ctx.uiWorkspace || null;
			const archiveOf = (service) =>
				!!service &&
				typeof service.archiveSession === 'function' &&
				typeof service.unarchiveSession === 'function';
			caps.archive = archiveOf(uiWorkspace) || archiveOf(workspaces);
			caps.catalog =
				!!ctx.remote &&
				!!ctx.remote.session &&
				typeof ctx.remote.session.modelCatalog === 'function';
			// Probing asks a provider for its model listing: one GET, no tokens. Hosts
			// without the llm Remote keep the panel and lose only the lamp.
			caps.probe =
				!!ctx.remote && !!ctx.remote.llm && typeof ctx.remote.llm.discoverModels === 'function';
			return caps;
		}

		function ctxRemote() {
			if (!activeRemote) throw new Error('remote is not available');
			return activeRemote;
		}

		/**
		 * `t` variant for code that renders outside a component (slot labels run in
		 * whatever context registered them), so a missing locale never throws.
		 */
		function looseT(key) {
			try {
				if (activeLocale && typeof activeLocale.bind === 'function') {
					return activeLocale.bind(NS)(key);
				}
			} catch (ignored) {
				/* fall through to the key */
			}
			return key;
		}

		function apply(ctx) {
			// Locale is optional at runtime even when injected before its own apply ran.
			const locale = ctx.locale;
			if (locale && typeof locale.register === 'function') {
				ctx.effect(() => locale.register(NS, { zh, en }), 'model-console: dictionaries');
			}
			activeLocale = locale || null;
			activeRemote = ctx.remote || null;
			activeWorkspaces = ctx.workspaces || null;
			activeUiWorkspace = ctx.uiWorkspace || null;
			probeCapabilities(ctx);

			const slots = ctx.slots;
			if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
				// Without the slot service there is nothing to mount; report instead of throwing.
				if (typeof console !== 'undefined' && console.warn) {
					console.warn('[model-console] slot service unavailable; panel not mounted');
				}
				return;
			}

			slots.inject('main', () =>
				slots.register({ name: 'main', key: PANEL_ID, locale: NS }, ModelConsolePage)
			);

			// Older Hosts ship no sidebar list slot; the main panel still mounts.
			slots.inject('sidebar.panellist', () =>
				slots.register(
					{
						name: 'sidebar.panellist',
						id: PANEL_ID,
						order: 1,
						label: () => looseT('panel'),
						locale: NS
					},
					ConsolePanelIcon
				)
			);
		}

		return { inject, apply };
	}
});
