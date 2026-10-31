/**
 * QQ chat bridge — browser half.
 *
 * Registers one first-level Settings section that shows the live OneBot
 * connection, the evolving persona, the memory store, and a small send-test
 * box. All data comes from the Host half's same-origin /qq-bot routes.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-qq-bot',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const API = '/qq-bot';

    async function api(path, init) {
      const response = await fetch(API + path, {
        cache: 'no-store',
        ...(init || {}),
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!response.ok) {
        throw new Error((data && data.error) || text || `HTTP ${response.status}`);
      }
      if (!data) throw new Error('接口返回了空数据');
      return data;
    }

    function post(path, body) {
      return api(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
    }

    function fmtTime(ms) {
      if (!ms) return '—';
      try {
        return new Date(ms).toLocaleString('zh-CN', { hour12: false });
      } catch {
        return '—';
      }
    }

    function fmtRequestAge(receivedAt) {
      if (!receivedAt) return '';
      const minutes = Math.floor((Date.now() - receivedAt) / 60000);
      if (!Number.isFinite(minutes) || minutes < 1) return '';
      if (minutes < 60) return ` · 已等待 ${minutes} 分钟`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return ` · 已等待 ${hours} 小时${hours >= 3 ? '，多半已在 QQ 侧过期' : ''}`;
      return ` · 已等待 ${Math.floor(hours / 24)} 天，多半已在 QQ 侧过期`;
    }

    function fmtUptime(ms) {
      if (!ms || ms < 0) return '—';
      const total = Math.floor(ms / 1000);
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      if (days > 0) return `${days} 天 ${hours} 小时`;
      if (hours > 0) return `${hours} 小时 ${minutes} 分`;
      return `${Math.max(1, minutes)} 分钟`;
    }

    function Badge({ status }) {
      const labels = {
        connected: '已连接',
        connecting: '连接中',
        reconnecting: '重连中',
        disabled: '已停用',
        error: '连接错误',
        idle: '待连接',
        stopped: '已停止',
      };
      const tone = status && status.connected
        ? 'ok'
        : status && (status.state === 'error' || status.lastError)
          ? 'err'
          : 'idle';
      const label = status ? (labels[status.state] || status.state) : '读取中';
      return h('span', { className: `qqb-badge qqb-badge-${tone}` },
        h('span', { className: 'qqb-dot' }),
        label,
      );
    }

    function Field({ label, value, mono }) {
      return h('div', { className: 'qqb-field' },
        h('span', { className: 'qqb-field-label' }, label),
        h('span', { className: `qqb-field-value${mono ? ' qqb-mono' : ''}` }, value || '—'),
      );
    }

    // A real switch for an on/off feature: the whole control is the label, and
    // the state is written straight through to settings so it survives reload.
    function Switch({ checked, onChange, disabled, onLabel, offLabel, title }) {
      return h('label', {
        className: `qqb-switch${checked ? ' qqb-switch-on' : ''}${disabled ? ' qqb-switch-busy' : ''}`,
        title: title || '',
      },
      h('input', {
        type: 'checkbox',
        checked: Boolean(checked),
        disabled: Boolean(disabled),
        onChange: (event) => onChange(event.target.checked),
      }),
      h('span', { className: 'qqb-switch-track', 'aria-hidden': 'true' },
        h('span', { className: 'qqb-switch-knob' }),
      ),
      h('span', { className: 'qqb-switch-text' }, checked ? onLabel : offLabel),
      );
    }

    function getIn(object, path) {
      let current = object;
      for (const key of path) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[key];
      }
      return current;
    }

    function setIn(object, path, value) {
      const [head, ...rest] = path;
      const copy = object && typeof object === 'object' && !Array.isArray(object) ? { ...object } : {};
      copy[head] = rest.length > 0 ? setIn(copy[head], rest, value) : value;
      return copy;
    }

    function ListInput({ value, onChange, disabled }) {
      const joined = Array.isArray(value) ? value.join(', ') : '';
      return h('input', {
        className: 'qqb-input qqb-input-full',
        defaultValue: joined,
        disabled,
        placeholder: '用逗号分隔',
        onBlur: (event) => {
          const items = event.target.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
          onChange(items);
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        },
      });
    }

    function FieldControl({ field, value, onChange, disabled }) {
      const hint = field.hint ? h('span', { className: 'qqb-field-hint' }, field.hint) : null;
      if (field.kind === 'checkbox') {
        return h('label', { className: 'qqb-check' },
          h('input', {
            type: 'checkbox',
            checked: Boolean(value),
            disabled,
            onChange: (event) => onChange(event.target.checked),
          }),
          h('span', null, field.label, hint),
        );
      }
      const label = h('span', { className: 'qqb-form-label' }, field.label, hint);
      if (field.kind === 'textarea') {
        return h('label', { className: 'qqb-form-row' }, label,
          h('textarea', {
            className: 'qqb-textarea qqb-textarea-sm',
            rows: field.rows || 3,
            value: value == null ? '' : value,
            disabled,
            onChange: (event) => onChange(event.target.value),
          }),
        );
      }
      if (field.kind === 'select') {
        return h('label', { className: 'qqb-form-row' }, label,
          h('select', {
            className: 'qqb-input qqb-input-full',
            value: value == null ? '' : value,
            disabled,
            onChange: (event) => onChange(event.target.value),
          }, (field.options || []).map((option) => h('option', { key: option.value, value: option.value }, option.label))),
        );
      }
      if (field.kind === 'number') {
        return h('label', { className: 'qqb-form-row' }, label,
          h('input', {
            className: 'qqb-input qqb-input-full',
            type: 'number',
            value: value == null ? '' : value,
            disabled,
            onChange: (event) => onChange(event.target.value === '' ? 0 : Number(event.target.value)),
          }),
        );
      }
      if (field.kind === 'list') {
        return h('label', { className: 'qqb-form-row' }, label,
          h(ListInput, {
            key: Array.isArray(value) ? value.join(',') : '',
            value,
            disabled,
            onChange,
          }),
        );
      }
      return h('label', { className: 'qqb-form-row' }, label,
        h('input', {
          className: 'qqb-input qqb-input-full',
          type: field.kind === 'password' ? 'password' : 'text',
          value: value == null ? '' : value,
          disabled,
          onChange: (event) => onChange(event.target.value),
        }),
      );
    }

    const SETTINGS_TABS = [
      {
        id: 'basic',
        label: '模型',
        groups: [
          {
            title: '模型参数',
            fields: [
              { path: ['model', 'maxTokens'], label: '最大输出 token', kind: 'number' },
            ],
          },
        ],
      },
      {
        id: 'abilities',
        label: '能力',
        groups: [],
      },
      {
        id: 'persona',
        label: '人设',
        groups: [
          {
            title: '底层人设',
            fields: [
              { path: ['persona', 'name'], label: '人设名（群里叫这个名字会触发）', kind: 'text' },
              { path: ['persona', 'identity'], label: '底层人设（最高优先级）', kind: 'textarea', rows: 5 },
              { path: ['persona', 'style'], label: '说话风格', kind: 'textarea', rows: 3 },
              { path: ['persona', 'rules'], label: '行为准则与禁忌', kind: 'textarea', rows: 4 },
              { path: ['persona', 'autoEvolve'], label: '根据长期交流自动完善人设', kind: 'checkbox', hint: '总开关在人设页「人设演化」卡片顶部；关闭后这里也不会触发。' },
              { path: ['persona', 'evolveEvery'], label: '每多少次回复演化一次', kind: 'number' },
            ],
          },
        ],
      },
      {
        id: 'chat',
        label: '对话',
        groups: [
          {
            title: '什么时候接话',
            fields: [
              { path: ['trigger', 'wakeWords'], label: '群聊唤醒词', kind: 'list' },
              { path: ['trigger', 'wakeMode'], label: '唤醒方式', kind: 'select', options: [{ value: 'prefix', label: '开头匹配' }, { value: 'contains', label: '包含匹配' }] },
              { path: ['trigger', 'respondToAt'], label: '被 @ 时回复', kind: 'checkbox' },
              { path: ['trigger', 'respondToReply'], label: '回复机器人消息时接话', kind: 'checkbox' },
              { path: ['trigger', 'respondToName'], label: '文本出现人设名时接话', kind: 'checkbox' },
              { path: ['trigger', 'privateAlways'], label: '私聊总是回复', kind: 'checkbox' },
              { path: ['trigger', 'groupAlways'], label: '群聊每条都回复（慎用）', kind: 'checkbox' },
              { path: ['trigger', 'cooldownMs'], label: '同一人回复冷却（毫秒）', kind: 'number' },
            ],
          },
          {
            title: '回复格式',
            fields: [
              { path: ['reply', 'split'], label: '长回复自动分段', kind: 'checkbox' },
              { path: ['reply', 'maxSegmentChars'], label: '单段字符上限', kind: 'number' },
              { path: ['reply', 'segmentDelayMs'], label: '分段间隔（毫秒）', kind: 'number' },
              { path: ['reply', 'maxChars'], label: '整条回复字符上限', kind: 'number' },
              { path: ['reply', 'quote'], label: '回复时引用原消息', kind: 'checkbox' },
              { path: ['reply', 'stripMarkdown'], label: '自动去掉 Markdown 标记', kind: 'checkbox' },
              { path: ['reply', 'continuous'], label: '按语境连续发多条', kind: 'checkbox' },
              { path: ['reply', 'maxSegments'], label: '最多连续消息条数', kind: 'number' },
            ],
          },
          {
            title: '报错回复',
            fields: [
              {
                path: ['reply', 'errorText'],
                label: '模型出错 / 超时 / 空回复时发送',
                kind: 'textarea',
                rows: 3,
                hint: '留空则不发送；可用 {error} 插入错误摘要',
              },
            ],
          },
          {
            title: '上下文',
            fields: [
              { path: ['context', 'privateSize'], label: '私聊短期记忆条数', kind: 'number' },
              { path: ['context', 'maxInputChars'], label: '单条入站消息字符上限', kind: 'number' },
            ],
          },
          {
            title: '主动发言',
            fields: [
              { path: ['proactive', 'enabled'], label: '启用主动发言', kind: 'checkbox' },
              { path: ['proactive', 'idleMinutes'], label: '安静多少分钟后考虑', kind: 'number' },
              { path: ['proactive', 'cooldownMinutes'], label: '同一目标冷却（分钟）', kind: 'number' },
              { path: ['proactive', 'chance'], label: '每分钟触发概率（0-1）', kind: 'number' },
            ],
          },
        ],
      },
      {
        id: 'groups',
        label: '群聊',
        groups: [
          {
            title: '群聊上下文',
            fields: [
              { path: ['context', 'groupSize'], label: '群聊上下文条数', kind: 'number' },
            ],
          },
        ],
      },
      {
        id: 'memory',
        label: '记忆',
        groups: [
          {
            title: '记忆区',
            fields: [
              { path: ['memory', 'enabled'], label: '启用长期记忆', kind: 'checkbox' },
              { path: ['memory', 'rememberAfter'], label: '来往多少条消息后自动记忆（默认 20）', kind: 'number' },
              { path: ['memory', 'maxEntries'], label: '触发压缩的对话条数', kind: 'number' },
              { path: ['memory', 'keepEntries'], label: '压缩后保留的条数', kind: 'number' },
              { path: ['memory', 'maxSummaryChars'], label: '摘要最大字符数', kind: 'number' },
            ],
          },
        ],
      },
      {
        id: 'security',
        label: '安全',
        groups: [
          {
            title: '访问控制',
            fields: [
              { path: ['access', 'master'], label: '主人 QQ（被攻击时优先 @ 求助）', kind: 'text' },
              { path: ['access', 'blacklist'], label: '黑名单 QQ', kind: 'list' },
              { path: ['access', 'whitelist'], label: '白名单 QQ（非空时只回复这些人）', kind: 'list' },
              { path: ['access', 'admins'], label: '管理员 QQ（可用 #qq 命令）', kind: 'list' },
              { path: ['access', 'autoApproveFriends'], label: '自动同意好友请求', kind: 'checkbox' },
              { path: ['access', 'autoApproveGroups'], label: '自动同意加群/邀请', kind: 'checkbox' },
              { path: ['access', 'requestNotifyMaster'], label: '好友/群请求私聊通知主人', kind: 'checkbox' },
            ],
          },
          {
            title: '群管理策略',
            fields: [
              { path: ['moderation', 'enabled'], label: '启用群管理工具', kind: 'checkbox' },
              { path: ['moderation', 'warnBeforeMute'], label: '禁言前至少警告次数', kind: 'number', hint: '默认 3 次；不满不能禁言' },
              { path: ['moderation', 'muteBeforeKick'], label: '踢人前至少禁言次数', kind: 'number', hint: '默认 2 次；不满不能踢人' },
              { path: ['moderation', 'warningWindowMinutes'], label: '警告记录有效期（分钟）', kind: 'number' },
              { path: ['moderation', 'warnCooldownSeconds'], label: '两次警告最小间隔（秒）', kind: 'number' },
              { path: ['moderation', 'muteSeconds'], label: '默认禁言秒数', kind: 'number' },
              { path: ['moderation', 'kickWindowMinutes'], label: '禁言记录有效期（分钟）', kind: 'number' },
              { path: ['moderation', 'warningTemplate'], label: '警告文案', kind: 'textarea', rows: 3, hint: '支持 {name} / {count} / {needed} / {reason}' },
              { path: ['moderation', 'autoAlertOnAttack'], label: '检测到明显攻击时自动 @ 主人', kind: 'checkbox' },
              { path: ['moderation', 'autoAlertCooldownMinutes'], label: '自动求助冷却（分钟）', kind: 'number' },
              { path: ['moderation', 'attackKeywords'], label: '攻击关键词', kind: 'list', hint: '命中后先自动 @ 主人求助' },
            ],
          },
        ],
      },
      {
        id: 'content',
        label: '内容',
        groups: [
          {
            title: '日记设置',
            fields: [
              { path: ['diary', 'enabled'], label: '启用日记', kind: 'checkbox' },
              { path: ['diary', 'dir'], label: '日记目录', kind: 'text', hint: '每天一个 YYYY-MM-DD.txt' },
              { path: ['diary', 'intervalMinutes'], label: '自动续写间隔（分钟）', kind: 'number' },
              { path: ['diary', 'maxChars'], label: '每篇正文上限（字符）', kind: 'number' },
              { path: ['diary', 'includeGroupChats'], label: '把群聊作为日记素材', kind: 'checkbox' },
              { path: ['diary', 'includePrivateChats'], label: '把私聊作为日记素材', kind: 'checkbox' },
            ],
          },
        ],
      },
      {
        id: 'connection',
        label: '连接',
        groups: [
          {
            title: 'OneBot 连接',
            fields: [
              { path: ['enabled'], label: '启用 QQ 桥', kind: 'checkbox' },
              { path: ['connection', 'wsUrl'], label: 'WebSocket 地址', kind: 'text', hint: 'NapCat 默认 ws://127.0.0.1:3001' },
              { path: ['connection', 'httpUrl'], label: 'HTTP API 地址（可选兜底）', kind: 'text' },
              { path: ['connection', 'reconnectMs'], label: '首次重连间隔（毫秒）', kind: 'number' },
              { path: ['connection', 'reconnectMaxMs'], label: '重连间隔上限（毫秒）', kind: 'number' },
              { path: ['connection', 'heartbeatMs'], label: '心跳间隔（毫秒）', kind: 'number' },
            ],
          },
          {
            title: '高级',
            fields: [
              { path: ['advanced', 'agentPreset'], label: 'Agent preset', kind: 'text', hint: '默认 qq-bot（联网 + 只读，无 shell / 写入）' },
              { path: ['advanced', 'rotateAfterTurns'], label: '多少轮后重建会话（0 关闭）', kind: 'number' },
              { path: ['advanced', 'agentTimeoutMs'], label: '等待智能体回复超时（毫秒）', kind: 'number' },
              { path: ['advanced', 'logMessages'], label: '在宿主日志打印消息摘要', kind: 'checkbox' },
            ],
          },
        ],
      },
    ];

    function ModelPicker({ models, selected, onSelect, onRefresh, emptyLabel = '跟随 DSH 默认模型', emptySub }) {
      const [open, setOpen] = useState(false);
      const groups = models && Array.isArray(models.groups) ? models.groups : [];
      const fallback = models && models.default ? models.default : null;
      const provider = selected && selected.provider ? selected.provider : '';
      const modelId = selected && selected.model ? selected.model : '';
      const currentGroup = groups.find((group) => group.id === provider);
      const currentModel = currentGroup && currentGroup.models.find((model) => model.id === modelId);
      const providerLabel = (group) => (group.id === 'deepseek-account' ? 'DeepSeek 账号' : (group.name || group.id));
      const emptyDescription = emptySub || (fallback ? `当前默认：${fallback.provider} / ${fallback.model}` : '使用 DSH 当前默认模型');
      const label = provider && modelId
        ? (currentModel ? currentModel.name : modelId)
        : emptyLabel;
      const sub = provider && modelId
        ? `${currentGroup ? providerLabel(currentGroup) : provider} · ${modelId}`
        : emptyDescription;
      return h('div', { className: 'qqb-model-picker' },
        h('button', {
          type: 'button',
          className: 'qqb-model-trigger',
          'aria-expanded': open,
          onClick: () => setOpen(!open),
        },
        h('div', { className: 'qqb-model-trigger-main' },
          h('span', { className: 'qqb-model-name' }, label),
          h('span', { className: 'qqb-model-sub' }, sub),
        ),
        h('span', { className: 'qqb-model-chevron' }, open ? '▴' : '▾'),
        ),
        open
          ? h('div', { className: 'qqb-model-list' },
            h('button', {
              type: 'button',
              className: `qqb-model-row${!provider && !modelId ? ' qqb-model-row-active' : ''}`,
              onClick: () => { onSelect('', ''); setOpen(false); },
            },
            h('div', null,
              h('div', { className: 'qqb-model-row-name' }, emptyLabel),
              h('div', { className: 'qqb-model-row-sub' }, emptyDescription),
            ),
            !provider && !modelId ? h('span', { className: 'qqb-model-check' }, '✓') : null,
            ),
            groups.length > 0
              ? groups.map((group) => h('div', { className: 'qqb-model-group', key: group.id },
                h('div', { className: 'qqb-model-group-name' }, providerLabel(group)),
                group.models.map((model) => {
                  const active = provider === group.id && modelId === model.id;
                  return h('button', {
                    type: 'button',
                    key: `${group.id}/${model.id}`,
                    className: `qqb-model-row${active ? ' qqb-model-row-active' : ''}`,
                    onClick: () => { onSelect(group.id, model.id); setOpen(false); },
                  },
                  h('div', null,
                    h('div', { className: 'qqb-model-row-name' }, model.name || model.id),
                    h('div', { className: 'qqb-model-row-sub' }, `${group.id} / ${model.id}${model.description ? ` · ${model.description}` : ''}`),
                  ),
                  active ? h('span', { className: 'qqb-model-check' }, '✓') : null,
                  );
                }),
              ))
              : h('div', { className: 'qqb-empty' }, '没有读取到可用模型。'),
            h('button', {
              type: 'button',
              className: 'qqb-btn qqb-btn-ghost',
              onClick: onRefresh,
            }, '刷新模型列表'),
          )
          : null,
      );
    }

    function EffortSelect({ value, onChange, label }) {
      return h('label', { className: 'qqb-form-row' }, label,
        h('select', {
          className: 'qqb-input qqb-input-full',
          value: value == null ? '' : value,
          onChange: (event) => onChange(event.target.value),
        },
        h('option', { value: '' }, '默认（按模型）'),
        h('option', { value: 'low' }, '低（low）'),
        h('option', { value: 'medium' }, '中（medium）'),
        h('option', { value: 'high' }, '高（high）'),
        h('option', { value: 'max' }, '最高（max）'),
        ),
      );
    }

    function GroupPicker({ groupsData, selected, onChange, onRefresh, loading }) {
      const groups = groupsData && Array.isArray(groupsData.groups) ? groupsData.groups : [];
      const selectedList = Array.isArray(selected) ? selected.map(String) : [];
      const selectedSet = new Set(selectedList);
      const allGroups = selectedSet.size === 0;
      const toggle = (id) => {
        const next = new Set(selectedSet);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange([...next]);
      };
      return h('div', { className: 'qqb-group-picker' },
        h('div', { className: 'qqb-group-picker-head' },
          h('div', null,
            h('div', { className: 'qqb-model-name' }, allGroups ? '全部群（不限制）' : `已选 ${selectedSet.size} 个群`),
            h('div', { className: 'qqb-model-sub' }, allGroups ? '机器人会在所有已加入的群工作' : '只在这些群发言'),
          ),
          h('div', { className: 'qqb-actions' },
            h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: () => onChange([]) }, '全部群'),
            h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: onRefresh, disabled: loading }, loading ? '刷新中…' : '刷新群列表'),
          ),
        ),
        groupsData && groupsData.warning ? h('p', { className: 'qqb-hint' }, groupsData.warning) : null,
        groups.length > 0
          ? h('div', { className: 'qqb-group-list' }, groups.map((group) => h('label', {
            className: `qqb-check qqb-group-row${selectedSet.has(group.id) ? ' qqb-group-row-active' : ''}`,
            key: group.id,
          },
          h('input', {
            type: 'checkbox',
            checked: selectedSet.has(group.id),
            onChange: () => toggle(group.id),
          }),
          h('span', { className: 'qqb-group-main' },
            h('span', { className: 'qqb-group-name' },
              group.name || group.id,
              group.missing ? h('span', { className: 'qqb-muted' }, '（未在群列表）') : null,
            ),
            h('span', { className: 'qqb-group-meta' },
              `${group.id}${group.memberCount ? ` · ${group.memberCount} 人` : ''}`,
            ),
          ),
          )))
          : h('div', { className: 'qqb-empty' }, loading ? '正在读取群列表…' : '没有读取到群；请先连接 OneBot 后刷新'),
        h('p', { className: 'qqb-hint' }, '不勾选任何群 = 所有已加入的群；勾选后只在选中的群工作（回复和记录），其他群会被忽略。私聊不受影响。'),
      );
    }

    function ContactPicker({ contacts, selected, onChange }) {
      const list = Array.isArray(contacts) ? contacts : [];
      const selectedList = Array.isArray(selected) ? selected.map(String) : [];
      const selectedSet = new Set(selectedList);
      const known = new Set(list.map((contact) => String(contact.uin)));
      const extras = selectedList.filter((uin) => !known.has(uin));
      const toggle = (uin) => {
        const next = new Set(selectedSet);
        if (next.has(uin)) next.delete(uin);
        else next.add(uin);
        onChange([...next]);
      };
      const rows = [
        ...extras.map((uin) => ({ uin, name: '未知联系人', extra: true })),
        ...list.map((contact) => ({ ...contact, uin: String(contact.uin), extra: false })),
      ];
      return h('div', { className: 'qqb-group-picker' },
        h('div', { className: 'qqb-group-picker-head' },
          h('div', null,
            h('div', { className: 'qqb-model-name' }, selectedSet.size === 0 ? '未选择（关闭）' : `已选 ${selectedSet.size} 人`),
            h('div', { className: 'qqb-model-sub' }, selectedSet.size === 0 ? '空白名单 = 不主动私聊任何人' : '只对这些联系人主动私聊'),
          ),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: () => onChange([]) }, '清空'),
        ),
        rows.length > 0
          ? h('div', { className: 'qqb-group-list' }, rows.map((row) => h('label', {
            className: `qqb-check qqb-group-row${selectedSet.has(row.uin) ? ' qqb-group-row-active' : ''}`,
            key: row.uin,
          },
          h('input', {
            type: 'checkbox',
            checked: selectedSet.has(row.uin),
            onChange: () => toggle(row.uin),
          }),
          h('span', { className: 'qqb-group-main' },
            h('span', { className: 'qqb-group-name' },
              row.name || row.uin,
              row.extra ? h('span', { className: 'qqb-muted' }, '（不在记忆列表）') : null,
            ),
            h('span', { className: 'qqb-group-meta' }, row.uin),
          ),
          )))
          : h('div', { className: 'qqb-empty' }, '还没有达到记忆门槛的联系人。'),
        h('p', { className: 'qqb-hint' }, '只从记忆区联系人里选；留空关闭主动私聊。主动发言开关和冷却仍在上面的「主动发言」里。'),
      );
    }

    function GroupMemoryPanel({ groups, onClear, busy }) {
      return h('section', { className: 'qqb-card' },
        h('div', { className: 'qqb-card-head' },
          h('div', null,
            h('h3', null, '群聊记忆'),
            h('p', { className: 'qqb-sub' }, '按群号保存的群摘要；和当前人设空间绑定，清空只影响这个群。'),
          ),
          h('span', { className: 'qqb-count' }, `${groups.length} 群`),
        ),
        groups.length === 0
          ? h('div', { className: 'qqb-empty' }, '暂无群聊记忆。')
          : h('div', { className: 'qqb-list' }, groups.map((group) => h('div', { className: 'qqb-row', key: group.id },
            h('div', { className: 'qqb-row-main' },
              h('div', { className: 'qqb-row-title' },
                group.name || group.id,
                h('span', { className: 'qqb-muted' }, ` ${group.id}`),
              ),
              h('div', { className: 'qqb-row-text' }, group.summary || '（还没有摘要）'),
              h('div', { className: 'qqb-row-meta' },
                `${group.messages || 0} 条消息 · 最近 ${fmtTime(group.lastSeen)}`,
              ),
            ),
            h('button', {
              type: 'button',
              className: 'qqb-btn qqb-btn-danger',
              disabled: busy === `clear-${group.id}`,
              onClick: () => onClear(group),
            }, '清空'),
          ))),
      );
    }

    function PersonaPresetPicker({ draft, setDraft }) {
      const presets = draft && draft.persona && Array.isArray(draft.persona.presets) ? draft.persona.presets : [];
      const active = (draft && draft.persona && draft.persona.activePreset) || '';
      const [selected, setSelected] = useState(active);
      const [hint, setHint] = useState('');
      const [creating, setCreating] = useState(false);
      const [newName, setNewName] = useState('');
      const [confirmDelete, setConfirmDelete] = useState(false);

      useEffect(() => {
        setSelected(active);
        setConfirmDelete(false);
      }, [active]);

      const currentPersona = (draft && draft.persona) || {};
      const makeSnapshot = (id, name) => ({
        id,
        name,
        identity: currentPersona.identity || '',
        style: currentPersona.style || '',
        rules: currentPersona.rules || '',
        examples: (currentPersona.examples || []).map((row) => ({ ...row })),
      });
      const syncActivePreset = (previous) => {
        const activeId = previous.persona && previous.persona.activePreset;
        if (!activeId) return previous;
        const list = (previous.persona.presets || []).map((item) => (item.id === activeId
          ? {
            ...item,
            name: String(previous.persona.name || item.name || '').trim() || item.name,
            identity: previous.persona.identity || '',
            style: previous.persona.style || '',
            rules: previous.persona.rules || '',
            examples: (previous.persona.examples || []).map((row) => ({ ...row })),
          }
          : item));
        return setIn(previous, ['persona', 'presets'], list);
      };
      const selectPreset = (nextId) => {
        setDraft((previous) => {
          let next = syncActivePreset(previous);
          if (!nextId) {
            next = setIn(next, ['persona', 'activePreset'], '');
            return next;
          }
          const preset = (next.persona.presets || []).find((item) => item.id === nextId);
          if (!preset) return next;
          next = setIn(next, ['persona', 'activePreset'], nextId);
          next = setIn(next, ['persona', 'name'], preset.name || '');
          next = setIn(next, ['persona', 'identity'], preset.identity || '');
          next = setIn(next, ['persona', 'style'], preset.style || '');
          next = setIn(next, ['persona', 'rules'], preset.rules || '');
          next = setIn(next, ['persona', 'examples'], (preset.examples || []).map((row) => ({ ...row })));
          return next;
        });
        setSelected(nextId);
        const preset = presets.find((item) => item.id === nextId);
        setHint(preset ? `已切换到预设「${preset.name}」；编辑后点「保存设置」。` : '已解除预设关联，当前字段作为自定义人设。');
      };
      const applyPreset = (preset) => {
        selectPreset(preset.id);
      };
      const saveCurrent = () => {
        const preset = presets.find((item) => item.id === selected);
        if (!preset) return;
        setDraft((previous) => {
          const list = (previous.persona.presets || []).map((item) => (item.id === preset.id
            ? {
              ...item,
              name: (currentPersona.name || item.name || '').trim() || item.name,
              identity: currentPersona.identity || '',
              style: currentPersona.style || '',
              rules: currentPersona.rules || '',
              examples: (currentPersona.examples || []).map((row) => ({ ...row })),
            }
            : item));
          return setIn(previous, ['persona', 'presets'], list);
        });
        setHint(`已保存当前人设到预设「${preset.name}」。`);
      };
      const createBlankPreset = () => {
        const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const preset = { id, name: '未命名预设', identity: '', style: '', rules: '', examples: [] };
        setDraft((previous) => {
          let next = syncActivePreset(previous);
          next = setIn(next, ['persona', 'presets'], [...(next.persona.presets || []), preset]);
          next = setIn(next, ['persona', 'activePreset'], id);
          next = setIn(next, ['persona', 'name'], '');
          next = setIn(next, ['persona', 'identity'], '');
          next = setIn(next, ['persona', 'style'], '');
          next = setIn(next, ['persona', 'rules'], '');
          next = setIn(next, ['persona', 'examples'], []);
          return next;
        });
        setSelected(id);
        setCreating(false);
        setConfirmDelete(false);
        setHint('已新建空白预设，下方人设已清空；填写后点「保存设置」生效。已保存的预设不会被改动。');
      };
      const beginCreate = () => {
        setNewName(`${currentPersona.name || '新'} 预设`);
        setCreating(true);
        setConfirmDelete(false);
        setHint('输入新预设名称，点「创建」；创建后再点「保存设置」生效。');
      };
      const createPreset = () => {
        const name = String(newName || '').trim();
        if (!name) {
          setHint('请输入预设名称。');
          return;
        }
        const id = `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const preset = makeSnapshot(id, name.slice(0, 40));
        setDraft((previous) => {
          let next = syncActivePreset(previous);
          next = setIn(next, ['persona', 'presets'], [...(next.persona.presets || []), preset]);
          next = setIn(next, ['persona', 'activePreset'], id);
          return next;
        });
        setSelected(id);
        setCreating(false);
        setNewName('');
        setHint(`已新建预设「${preset.name}」；点「保存设置」后生效。`);
      };
      const deletePreset = () => {
        const preset = presets.find((item) => item.id === selected);
        if (!preset) return;
        if (!confirmDelete) {
          setConfirmDelete(true);
          setHint(`再点一次「删除」确认删除预设「${preset.name}」。`);
          return;
        }
        setDraft((previous) => {
          let next = syncActivePreset(previous);
          next = setIn(next, ['persona', 'presets'], (next.persona.presets || []).filter((item) => item.id !== preset.id));
          if (next.persona.activePreset === preset.id) next = setIn(next, ['persona', 'activePreset'], '');
          return next;
        });
        setSelected('');
        setConfirmDelete(false);
        setHint(`已删除预设「${preset.name}」。`);
      };

      return h('div', { className: 'qqb-persona-presets' },
        h('div', { className: 'qqb-persona-preset-row' },
          h('select', {
            className: 'qqb-input qqb-input-full',
            value: selected,
            onChange: (event) => selectPreset(event.target.value),
          },
          h('option', { value: '' }, '自定义 / 未关联预设'),
          presets.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name || preset.id)),
          ),
        ),
        h('div', { className: 'qqb-actions' },
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', disabled: !selected, onClick: () => {
            const preset = presets.find((item) => item.id === selected);
            if (preset) applyPreset(preset);
          } }, '载入'),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', disabled: !selected, onClick: saveCurrent }, '保存当前到选中'),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: createBlankPreset }, '新建预设'),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: beginCreate }, '保存当前并新建预设'),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-danger', disabled: !selected, onClick: deletePreset }, confirmDelete ? '确认删除' : '删除'),
        ),
        creating
          ? h('div', { className: 'qqb-persona-preset-create' },
            h('input', {
              className: 'qqb-input qqb-input-full',
              value: newName,
              placeholder: '新预设名称',
              onChange: (event) => setNewName(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !(event.nativeEvent && event.nativeEvent.isComposing)) createPreset();
              },
            }),
            h('div', { className: 'qqb-actions' },
              h('button', { type: 'button', className: 'qqb-btn', onClick: createPreset }, '创建'),
              h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: () => { setCreating(false); setHint(''); } }, '取消'),
            ),
          )
          : null,
        h('p', { className: 'qqb-hint' },
          '预设是快照：载入后编辑下方人设，点「保存设置」生效；要更新预设点「保存当前到选中」。每个预设拥有独立的联系人/群记忆、自我认知和聊天上下文，切换时会重置当前对话。',
        ),
        hint ? h('p', { className: 'qqb-hint' }, hint) : null,
      );
    }

    function ImageSearchTester({ connected }) {
      const [query, setQuery] = useState('');
      const [results, setResults] = useState([]);
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [targetType, setTargetType] = useState('group');
      const [targetId, setTargetId] = useState('');

      const search = async () => {
        const q = query.trim();
        if (!q) {
          setError('先输入要搜索的图片关键词。');
          return;
        }
        setBusy('search');
        setError('');
        setNotice('');
        try {
          const data = await api(`/images/search?q=${encodeURIComponent(q)}&limit=8`);
          const list = Array.isArray(data.results) ? data.results : [];
          setResults(list);
          if (list.length === 0) setNotice('没有搜到图片，换个关键词试试。');
        } catch (failure) {
          setError(failure && failure.message ? failure.message : String(failure));
        } finally {
          setBusy('');
        }
      };

      const send = async (item) => {
        const target = targetId.trim();
        if (!target) {
          setError('先填群号或 QQ 号，再点发送。');
          return;
        }
        setBusy(`send-${item.id}`);
        setError('');
        setNotice('');
        try {
          const data = await post('/images/send', {
            targetType,
            targetId: target,
            id: item.id,
            page: item.page || '',
          });
          setNotice(data.message || '已发送。');
        } catch (failure) {
          setError(failure && failure.message ? failure.message : String(failure));
        } finally {
          setBusy('');
        }
      };

      return h('div', { className: 'qqb-image-tester' },
        h('div', { className: 'qqb-image-searchbar' },
          h('input', {
            className: 'qqb-input qqb-input-grow',
            value: query,
            placeholder: '试搜一张，例如：橘猫 / 城市夜景',
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !(event.nativeEvent && event.nativeEvent.isComposing)) void search();
            },
          }),
          h('button', {
            type: 'button',
            className: 'qqb-btn',
            disabled: busy === 'search',
            onClick: () => { void search(); },
          }, busy === 'search' ? '搜索中…' : '搜索'),
        ),
        h('p', { className: 'qqb-hint' },
          connected
            ? '这里用已保存的设置做搜索和发送测试；聊天时由 qq_image_search 自动找图并发图。'
            : 'OneBot 未连接：可以搜索预览，但暂时发不到 QQ；先在「连接」里连上 NapCat / Lagrange。',
        ),
        h('div', { className: 'qqb-image-sendbar' },
          h('select', {
            className: 'qqb-input qqb-select',
            value: targetType,
            onChange: (event) => setTargetType(event.target.value),
          },
          h('option', { value: 'group' }, '群聊'),
          h('option', { value: 'private' }, '私聊'),
          ),
          h('input', {
            className: 'qqb-input',
            value: targetId,
            placeholder: targetType === 'group' ? '群号' : 'QQ 号',
            onChange: (event) => setTargetId(event.target.value),
          }),
          h('span', { className: 'qqb-hint' }, '发送目标（只用于本页测试）'),
        ),
        error ? h('div', { className: 'qqb-row-feedback qqb-row-feedback-error' }, error) : null,
        notice ? h('div', { className: 'qqb-row-feedback qqb-row-feedback-ok' }, notice) : null,
        results.length > 0
          ? h('div', { className: 'qqb-image-grid' }, results.map((item) => h('div', { className: 'qqb-image-card', key: item.id },
            item.thumb
              ? h('img', {
                className: 'qqb-image-thumb',
                src: item.thumb,
                alt: item.title || '搜索结果',
                loading: 'lazy',
              })
              : h('div', { className: 'qqb-image-thumb qqb-image-thumb-empty' }, '无缩略图'),
            h('div', { className: 'qqb-image-title' }, item.title || '无标题'),
            h('div', { className: 'qqb-image-meta' }, item.url),
            h('div', { className: 'qqb-sticker-actions' },
              h('button', {
                type: 'button',
                className: 'qqb-btn',
                disabled: busy === `send-${item.id}`,
                onClick: () => { void send(item); },
              }, busy === `send-${item.id}` ? '发送中…' : '发送'),
              item.page
                ? h('a', {
                  className: 'qqb-btn qqb-btn-ghost',
                  href: item.page,
                  target: '_blank',
                  rel: 'noreferrer',
                }, '来源')
                : null,
            ),
          )))
          : null,
      );
    }

    function AbilitySettings({ draft, update, models, onSelectSearchModel, onSelectVisionModel, onRefreshModels, connected }) {
      const renderFields = (fields) => h('div', { className: 'qqb-form-grid' }, fields.map((item) => h(FieldControl, {
        key: item.path.join('.'),
        field: item,
        value: getIn(draft, item.path),
        onChange: (value) => update(item.path, value),
      })));
      const capabilityHead = (title, desc, path) => h('div', { className: 'qqb-form-group-head' },
        h('div', { className: 'qqb-capability-title' },
          h('h4', { className: 'qqb-subhead' }, title),
          h('p', { className: 'qqb-hint' }, desc),
        ),
        h(Switch, {
          checked: Boolean(getIn(draft, path)),
          onLabel: '已启用',
          offLabel: '已关闭',
          onChange: (value) => update(path, value),
        }),
      );
      return h(React.Fragment, null,
        h('div', { className: 'qqb-form-group qqb-capability' },
          capabilityHead('联网搜索', '查实时信息、事实核查和外部资料；使用单独的搜索模型，聊天模型没有搜索凭据也能用。', ['search', 'enabled']),
          h(ModelPicker, {
            models,
            selected: draft.search,
            onSelect: onSelectSearchModel,
            onRefresh: onRefreshModels,
            emptyLabel: '跟随默认模型',
            emptySub: '搜索会话使用的模型',
          }),
          renderFields([
            { path: ['search', 'maxResults'], label: '每次返回结果条数', kind: 'number' },
          ]),
        ),
        h('div', { className: 'qqb-form-group qqb-capability' },
          capabilityHead('图片解析', '用单独的视觉模型看图；聊天模型是纯文本时也能理解别人发的图片。', ['vision', 'enabled']),
          h(ModelPicker, {
            models,
            selected: draft.vision,
            onSelect: onSelectVisionModel,
            onRefresh: onRefreshModels,
            emptyLabel: '跟随默认模型',
            emptySub: '图片解析使用的模型',
          }),
          renderFields([
            { path: ['vision', 'autoTagStickers'], label: '自动识别新收藏的表情', kind: 'checkbox' },
            { path: ['vision', 'maxBytes'], label: '单张待解析图片上限（字节）', kind: 'number' },
          ]),
        ),
        h('div', { className: 'qqb-form-group qqb-capability' },
          capabilityHead('图片搜索', '按关键词在网上搜图，并把图片直接发到 QQ；聊天里的 qq_image_search 就用它找图和发图。', ['imagesearch', 'enabled']),
          renderFields([
            { path: ['imagesearch', 'maxResults'], label: '候选图片数量', kind: 'number' },
            { path: ['imagesearch', 'maxBytes'], label: '单张图片上限（字节）', kind: 'number' },
            { path: ['imagesearch', 'safeSearch'], label: '严格安全过滤', kind: 'checkbox' },
            { path: ['imagesearch', 'cooldownSeconds'], label: '同一聊天发图冷却（秒）', kind: 'number' },
            { path: ['imagesearch', 'dir'], label: '图片缓存目录', kind: 'text', hint: '留空使用 <dataDir>/images' },
          ]),
          h(ImageSearchTester, { connected }),
        ),
        h('div', { className: 'qqb-form-group qqb-capability' },
          capabilityHead('表情包', '自动收藏、同步 QQ 收藏，并按语境发一张表情；表情库在下方「表情库」里管理。', ['stickers', 'enabled']),
          renderFields([
            { path: ['stickers', 'replyChance'], label: '每次回复自动发表情概率（0-1）', kind: 'number', hint: '例如 0.15 = 15%；0 关闭' },
            { path: ['stickers', 'cooldownSeconds'], label: '发表情冷却（秒）', kind: 'number' },
            { path: ['stickers', 'autoCollect'], label: '自动收藏收到的表情', kind: 'checkbox' },
            { path: ['stickers', 'syncQQFaces'], label: '自动同步 QQ 收藏表情', kind: 'checkbox' },
            { path: ['stickers', 'maxBytes'], label: '单张表情最大字节数', kind: 'number' },
            { path: ['stickers', 'dir'], label: '表情保存目录', kind: 'text' },
          ]),
        ),
      );
    }

    function SettingsPanel({ draft, setDraft, onSave, busy, tab, setTab, tokenDirty, setTokenDirty, models, onSelectSearchModel, onSelectVisionModel, onSelectChannelModel, onRefreshModels, joinedGroups, groupsLoading, onRefreshGroups, contacts, requestCount, connected }) {
      if (!draft) {
        return h('section', { className: 'qqb-card' },
          h('h3', null, '参数设置'),
          h('div', { className: 'qqb-empty' }, '正在读取设置…'),
        );
      }
      const current = SETTINGS_TABS.find((item) => item.id === tab) || SETTINGS_TABS[0];
      const connection = draft.connection || {};
      const update = (path, value) => setDraft((previous) => setIn(previous, path, value));
      const chatProvider = (draft.model && draft.model.provider) || (models && models.default ? models.default.provider : '');
      const chatModel = (draft.model && draft.model.model) || (models && models.default ? models.default.model : '');
      const chatLabel = chatProvider && chatModel ? `${chatProvider}/${chatModel}` : 'DSH 默认';
      return h('section', { className: 'qqb-card' },
        h('div', { className: 'qqb-card-head' },
          h('div', null,
            h('h3', null, '参数设置'),
            h('p', { className: 'qqb-sub' }, '保存到 settings.json，立即生效；模型 / preset 变更会在下一条消息重建智能体。'),
          ),
          h('button', {
            type: 'button',
            className: 'qqb-btn',
            disabled: busy === 'settings',
            onClick: onSave,
          }, busy === 'settings' ? '保存中…' : '保存设置'),
        ),
        h('div', { className: 'qqb-settings-layout' },
          h('nav', { className: 'qqb-settings-nav' }, SETTINGS_TABS.map((item) => h('button', {
            type: 'button',
            key: item.id,
            className: `qqb-settings-nav-item${item.id === tab ? ' qqb-settings-nav-item-active' : ''}`,
            onClick: () => setTab(item.id),
          },
          h('span', null, item.label),
          item.id === 'security' && requestCount > 0
            ? h('span', { className: 'qqb-count-badge' }, String(requestCount))
            : null,
          ))),
          h('div', { className: 'qqb-settings-content' },
        tab === 'basic'
          ? h(React.Fragment, null,
            h('div', { className: 'qqb-form-group' },
              h('h4', { className: 'qqb-subhead' }, '群聊模型'),
              h(ModelPicker, {
                models,
                selected: draft.model.group,
                onSelect: (provider, model) => onSelectChannelModel('group', provider, model),
                onRefresh: onRefreshModels,
                emptyLabel: '跟随默认模型',
                emptySub: `默认：${chatLabel}`,
              }),
              h(EffortSelect, {
                label: '思考强度',
                value: (draft.model.group && draft.model.group.reasoningEffort) || '',
                onChange: (value) => update(['model', 'group', 'reasoningEffort'], value),
              }),
            ),
            h('div', { className: 'qqb-form-group' },
              h('h4', { className: 'qqb-subhead' }, '私聊模型'),
              h(ModelPicker, {
                models,
                selected: draft.model.private,
                onSelect: (provider, model) => onSelectChannelModel('private', provider, model),
                onRefresh: onRefreshModels,
                emptyLabel: '跟随默认模型',
                emptySub: `默认：${chatLabel}`,
              }),
              h(EffortSelect, {
                label: '思考强度',
                value: (draft.model.private && draft.model.private.reasoningEffort) || '',
                onChange: (value) => update(['model', 'private', 'reasoningEffort'], value),
              }),
            ),
          )
          : null,
        tab === 'abilities'
          ? h(AbilitySettings, {
            draft,
            update,
            models,
            onSelectSearchModel,
            onSelectVisionModel,
            onRefreshModels,
            connected,
          })
          : null,
        tab === 'persona'
          ? h('div', { className: 'qqb-form-group' },
            h('h4', { className: 'qqb-subhead' }, '人设预设'),
            h(PersonaPresetPicker, { draft, setDraft }),
          )
          : null,
        tab === 'groups'
          ? h('div', { className: 'qqb-form-group' },
            h('h4', { className: 'qqb-subhead' }, '在哪些群发言'),
            h(GroupPicker, {
              groupsData: joinedGroups,
              selected: (draft.access && draft.access.groups) || [],
              onChange: (groups) => update(['access', 'groups'], groups),
              onRefresh: onRefreshGroups,
              loading: groupsLoading,
            }),
          )
          : null,
        h('div', { className: 'qqb-form-groups' }, current.groups.map((group) => h('div', { className: 'qqb-form-group', key: group.title },
          h('h4', { className: 'qqb-subhead' }, group.title),
          h('div', { className: 'qqb-form-grid' }, group.fields.map((field) => h(FieldControl, {
            key: field.path.join('.'),
            field,
            value: getIn(draft, field.path),
            onChange: (value) => update(field.path, value),
          }))),
        ))),
        tab === 'chat'
          ? h('div', { className: 'qqb-form-group' },
            h('h4', { className: 'qqb-subhead' }, '主动私聊白名单'),
            h(ContactPicker, {
              contacts,
              selected: (draft.proactive && draft.proactive.privateWhitelist) || [],
              onChange: (list) => update(['proactive', 'privateWhitelist'], list),
            }),
          )
          : null,
        tab === 'connection'
          ? h('div', { className: 'qqb-form-group' },
            h('h4', { className: 'qqb-subhead' }, 'OneBot 访问令牌'),
            h('label', { className: 'qqb-check' },
              h('input', {
                type: 'checkbox',
                checked: tokenDirty,
                onChange: (event) => {
                  setTokenDirty(event.target.checked);
                  if (!event.target.checked) update(['connection', 'accessToken'], '');
                },
              }),
              h('span', null, '更新 access token'),
            ),
            h('input', {
              className: 'qqb-input qqb-input-full',
              type: 'password',
              disabled: !tokenDirty,
              value: connection.accessToken || '',
              placeholder: connection.accessTokenSet ? '已设置；留空并保存会清除' : '未设置',
              onChange: (event) => update(['connection', 'accessToken'], event.target.value),
            }),
          )
          : null,
        h('p', { className: 'qqb-hint' }, `写入：${draft.settingsPath || '~/.dsh-qq-bot/settings.json'}`),
        h('div', { className: 'qqb-settings-footer' },
          h('span', { className: 'qqb-hint' }, '修改后点这里保存'),
          h('button', {
            type: 'button',
            className: 'qqb-btn',
            disabled: busy === 'settings',
            onClick: onSave,
          }, busy === 'settings' ? '保存中…' : '保存设置'),
        ),
          ),
        ),
      );
    }

    function PresetDialogues({ draft, setDraft, onSave, busy }) {
      const [open, setOpen] = useState(true);
      if (!draft) {
        return h('section', { className: 'qqb-card qqb-examples' },
          h('div', { className: 'qqb-card-head' },
            h('div', { className: 'qqb-examples-heading' },
              h('span', { className: 'qqb-examples-icon' }, '💬'),
              h('h3', null, '预设对话'),
              h('span', { className: 'qqb-count-badge' }, '0'),
            ),
          ),
          h('div', { className: 'qqb-empty' }, '正在读取设置…'),
        );
      }
      const persona = draft.persona || {};
      const examples = Array.isArray(persona.examples) ? persona.examples : [];
      const updateExamples = (next) => setDraft((previous) => setIn(previous, ['persona', 'examples'], next));
      const addExample = () => {
        if (examples.length >= 20) return;
        updateExamples([...examples, { user: '', assistant: '' }]);
        setOpen(true);
      };
      const removeExample = (index) => {
        updateExamples(examples.filter((_, at) => at !== index));
      };
      const editExample = (index, key, value) => {
        updateExamples(examples.map((row, at) => (at === index ? { ...row, [key]: value } : row)));
      };
      return h('section', { className: 'qqb-card qqb-examples' },
        h('div', { className: 'qqb-card-head' },
          h('div', { className: 'qqb-examples-heading' },
            h('span', { className: 'qqb-examples-icon' }, '💬'),
            h('h3', null, '预设对话'),
            h('span', { className: 'qqb-count-badge' }, String(examples.length)),
          ),
          h('div', { className: 'qqb-actions' },
            h('button', {
              type: 'button',
              className: 'qqb-btn qqb-btn-ghost',
              onClick: () => setOpen(!open),
            }, open ? '收起' : '展开'),
            h('button', {
              type: 'button',
              className: 'qqb-btn qqb-btn-ghost',
              disabled: examples.length >= 20,
              onClick: addExample,
            }, '添加对话'),
            h('button', {
              type: 'button',
              className: 'qqb-btn',
              disabled: busy === 'settings',
              onClick: onSave,
            }, busy === 'settings' ? '保存中…' : '保存'),
          ),
        ),
        open
          ? h(React.Fragment, null,
            h('p', { className: 'qqb-sub' }, '添加一些预设的对话来帮助机器人更好地理解角色设定。'),
            h('div', { className: 'qqb-example-list' },
              examples.length === 0
                ? h('div', { className: 'qqb-empty' }, '还没有预设对话。点「添加对话」写一组。')
                : examples.map((example, index) => h('div', { className: 'qqb-example', key: index },
                  h('div', { className: 'qqb-example-fields' },
                    h('label', { className: 'qqb-example-field' },
                      h('span', { className: 'qqb-form-label' }, '用户消息'),
                      h('textarea', {
                        className: 'qqb-textarea qqb-textarea-sm',
                        rows: 3,
                        value: example.user || '',
                        placeholder: '例如：你是狗吗',
                        onChange: (event) => editExample(index, 'user', event.target.value),
                      }),
                    ),
                    h('label', { className: 'qqb-example-field' },
                      h('span', { className: 'qqb-form-label' }, 'AI 回答'),
                      h('textarea', {
                        className: 'qqb-textarea qqb-textarea-sm',
                        rows: 3,
                        value: example.assistant || '',
                        placeholder: '例如：阿拉~我好像听到了一条野狗在吠叫欸',
                        onChange: (event) => editExample(index, 'assistant', event.target.value),
                      }),
                    ),
                  ),
                  h('button', {
                    type: 'button',
                    className: 'qqb-icon-btn',
                    title: '删除这组对话',
                    'aria-label': '删除这组对话',
                    onClick: () => removeExample(index),
                  }, '🗑'),
                )),
            ),
            h('p', { className: 'qqb-hint' }, '这些示例会进入系统提示词，用来模仿语气和反应方式，不会逐字复读。最多 20 组。'),
          )
          : null,
      );
    }

    function DiaryPanel({ diary, onWrite, onRefresh, busy }) {
      const preview = diary && diary.preview ? diary.preview : '';
      return h('section', { className: 'qqb-card qqb-diary' },
        h('div', { className: 'qqb-card-head' },
          h('div', { className: 'qqb-examples-heading' },
            h('span', { className: 'qqb-examples-icon' }, '📔'),
            h('h3', null, '日记'),
            diary ? h('span', { className: 'qqb-count-badge' }, String(diary.count || 0)) : null,
          ),
          h('div', { className: 'qqb-actions' },
            h('button', {
              type: 'button',
              className: 'qqb-btn qqb-btn-ghost',
              onClick: onRefresh,
            }, '刷新'),
            h('button', {
              type: 'button',
              className: 'qqb-btn',
              disabled: busy,
              onClick: onWrite,
            }, busy ? '写作中…' : '立即写一篇'),
          ),
        ),
        diary
          ? h('div', { className: 'qqb-fields qqb-fields-tight' },
            h(Field, { label: '目录', value: diary.dir, mono: true }),
            h(Field, { label: '今天', value: diary.date }),
            h(Field, { label: '最近更新', value: fmtTime(diary.lastWriteAt) }),
            h(Field, { label: '自动续写', value: diary.enabled ? `每 ${diary.intervalMinutes || 60} 分钟` : '已关闭' }),
          )
          : h('div', { className: 'qqb-empty' }, '正在读取日记…'),
        preview
          ? h('pre', { className: 'qqb-pre qqb-diary-preview' }, preview)
          : h('div', { className: 'qqb-empty' }, '今天还没有日记。到时间会自动写，也可以点「立即写一篇」。'),
        h('p', { className: 'qqb-hint' },
          '每天一个 txt，当天的内容会续写进同一个文件；路径、间隔和素材范围在「参数设置 → 日记」里改。',
        ),
      );
    }

    function StickerCard({ item, onSave, onDelete, selectable, selected, onToggle }) {
      const [tags, setTags] = useState((item.tags || []).join(', '));
      const [description, setDescription] = useState(item.description || '');
      return h('div', { className: `qqb-sticker-card${selected ? ' qqb-sticker-selected' : ''}` },
        selectable
          ? h('label', { className: 'qqb-sticker-select' },
            h('input', {
              type: 'checkbox',
              checked: Boolean(selected),
              onChange: () => onToggle(item.id),
            }),
            h('span', null, '选择'),
          )
          : null,
        h('img', {
          className: 'qqb-sticker-img',
          src: item.url,
          alt: item.id,
          loading: 'lazy',
        }),
        h('div', { className: 'qqb-sticker-id' }, `${item.id}${item.source ? ` · ${item.source}` : ''}`),
        h('input', {
          className: 'qqb-input qqb-input-full',
          value: tags,
          placeholder: '标签，用逗号分隔',
          onChange: (event) => setTags(event.target.value),
        }),
        h('input', {
          className: 'qqb-input qqb-input-full',
          value: description,
          placeholder: '描述（可选）',
          onChange: (event) => setDescription(event.target.value),
        }),
        h('div', { className: 'qqb-sticker-actions' },
          h('button', {
            type: 'button',
            className: 'qqb-btn qqb-btn-ghost',
            onClick: () => onSave(item.id, tags, description),
          }, '保存标签'),
          h('button', {
            type: 'button',
            className: 'qqb-btn qqb-btn-danger',
            onClick: () => onDelete(item),
          }, '删除'),
        ),
      );
    }

    function StickerPanel({ stickers, onSync, onRefresh, onAutoTag, autoTagging, busy, onOpen }) {
      const items = stickers && Array.isArray(stickers.items) ? stickers.items : [];
      return h('section', { className: 'qqb-card qqb-stickers' },
        h('div', { className: 'qqb-card-head' },
          h('div', { className: 'qqb-examples-heading' },
            h('span', { className: 'qqb-examples-icon' }, '🧩'),
            h('h3', null, '表情包'),
            h('span', { className: 'qqb-count-badge' }, String(items.length)),
          ),
          h('div', { className: 'qqb-actions' },
            h('button', { type: 'button', className: 'qqb-btn', onClick: onOpen }, '打开表情包管理'),
            h('button', {
              type: 'button',
              className: 'qqb-btn qqb-btn-ghost',
              disabled: autoTagging,
              onClick: onAutoTag,
            }, autoTagging ? '排队中…' : '自动识别未标注'),
            h('button', {
              type: 'button',
              className: 'qqb-btn qqb-btn-ghost',
              disabled: busy,
              onClick: onSync,
            }, busy ? '同步中…' : '同步 QQ 收藏'),
          ),
        ),
        h('p', { className: 'qqb-sub' }, '表情包已经改成独立管理页：多选、批量删除、搜索、标签编辑都在里面。'),
        stickers
          ? h('div', { className: 'qqb-fields qqb-fields-tight' },
            h(Field, { label: '目录', value: stickers.dir, mono: true }),
            h(Field, { label: '最近同步', value: fmtTime(stickers.lastQQSyncAt) }),
            h(Field, { label: '可用', value: `${items.length} 张` }),
          )
          : h('div', { className: 'qqb-empty' }, '正在读取表情包…'),
        h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: onOpen },
          `打开管理（${items.length} 张，可多选批量删除）`),
      );
    }

    function StickerManager({ open, stickers, onClose, onSync, onRefresh, onTag, onDelete, onDeleteBatch, onAutoTag, autoTagging, busy }) {
      const [selected, setSelected] = useState([]);
      const [query, setQuery] = useState('');
      const items = stickers && Array.isArray(stickers.items) ? stickers.items : [];
      useEffect(() => {
        if (!open) {
          setSelected([]);
          setQuery('');
        }
      }, [open]);
      if (!open) return null;
      const q = query.trim().toLowerCase();
      const filtered = items.filter((item) => !q
        || String(item.id).toLowerCase().includes(q)
        || (item.tags || []).some((tag) => String(tag).toLowerCase().includes(q))
        || String(item.description || '').toLowerCase().includes(q)
        || String(item.source || '').toLowerCase().includes(q));
      const selectedSet = new Set(selected);
      const allSelected = filtered.length > 0 && filtered.every((item) => selectedSet.has(item.id));
      const toggle = (id) => {
        setSelected((previous) => (previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]));
      };
      const toggleAll = () => {
        const ids = filtered.map((item) => item.id);
        setSelected((previous) => {
          if (filtered.every((item) => previous.includes(item.id))) {
            return previous.filter((id) => !ids.includes(id));
          }
          return [...new Set([...previous, ...ids])];
        });
      };
      const deleteSelected = async () => {
        const ids = selected.filter((id) => items.some((item) => item.id === id));
        if (ids.length === 0) return;
        await onDeleteBatch(ids);
        setSelected([]);
      };
      return h('div', {
        className: 'qqb-modal-backdrop',
        onClick: (event) => {
          if (event.target === event.currentTarget) onClose();
        },
      },
      h('div', { className: 'qqb-modal qqb-sticker-manager' },
        h('div', { className: 'qqb-card-head' },
          h('div', null,
            h('h3', null, '表情包管理'),
            h('p', { className: 'qqb-sub' }, `共 ${items.length} 张；勾选后可以批量删除，也可以单独改标签。`),
          ),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: onClose }, '关闭'),
        ),
        h('div', { className: 'qqb-sticker-manager-toolbar' },
          h('input', {
            className: 'qqb-input qqb-input-full',
            value: query,
            placeholder: '搜索 id、标签、描述或来源',
            onChange: (event) => setQuery(event.target.value),
          }),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: toggleAll },
            allSelected ? '取消全选' : '全选当前'),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: () => setSelected([]) }, '清空选择'),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: onRefresh }, '刷新'),
          h('button', {
            type: 'button',
            className: 'qqb-btn qqb-btn-ghost',
            disabled: autoTagging,
            onClick: onAutoTag,
          }, autoTagging ? '排队中…' : '自动识别未标注'),
          h('button', { type: 'button', className: 'qqb-btn', disabled: busy, onClick: onSync }, busy ? '同步中…' : '同步 QQ 收藏'),
        ),
        h('div', { className: 'qqb-sticker-manager-summary' },
          h('span', null, `已选 ${selected.length} 张`),
          h('button', {
            type: 'button',
            className: 'qqb-btn qqb-btn-danger',
            disabled: selected.length === 0,
            onClick: deleteSelected,
          }, `批量删除${selected.length ? `（${selected.length}）` : ''}`),
        ),
        filtered.length === 0
          ? h('div', { className: 'qqb-empty' }, items.length === 0 ? '还没有表情。' : '没有匹配的表情。')
          : h('div', { className: 'qqb-sticker-manager-grid' }, filtered.map((item) => h(StickerCard, {
            key: item.id,
            item,
            selectable: true,
            selected: selectedSet.has(item.id),
            onToggle: toggle,
            onSave: onTag,
            onDelete: async (entry) => {
              await onDelete(entry);
              setSelected((previous) => previous.filter((id) => id !== entry.id));
            },
          }))),
      ));
    }

    function ContactMemoryCard({ contact, onSave, onClear, busy }) {
      const [editing, setEditing] = useState(false);
      const [name, setName] = useState(contact.name || '');
      const [relation, setRelation] = useState(contact.relation || '');
      const [aliases, setAliases] = useState((contact.aliases || []).join('、'));
      const [facts, setFacts] = useState((contact.facts || []).join('\n'));
      const [impression, setImpression] = useState(contact.impression || '');

      useEffect(() => {
        if (editing) return;
        setName(contact.name || '');
        setRelation(contact.relation || '');
        setAliases((contact.aliases || []).join('、'));
        setFacts((contact.facts || []).join('\n'));
        setImpression(contact.impression || '');
      }, [contact, editing]);

      const save = async () => {
        await onSave(contact.uin, { name, relation, aliases, facts, impression });
        setEditing(false);
      };

      return h('div', { className: 'qqb-row qqb-memory-row' },
        h('div', { className: 'qqb-row-main' },
          h('div', { className: 'qqb-row-title' },
            contact.name || contact.uin,
            h('span', { className: 'qqb-muted' }, ` ${contact.uin}`),
            contact.relation ? h('span', { className: 'qqb-tag' }, contact.relation) : null,
            contact.familiar ? h('span', { className: 'qqb-tag' }, '熟人') : null,
          ),
          h('div', { className: 'qqb-row-text' },
            contact.summary || contact.impression || '（还没有摘要）',
          ),
          (contact.aliases || []).length
            ? h('div', { className: 'qqb-row-note' }, `别名：${contact.aliases.join('、')}`)
            : null,
          (contact.facts || []).length
            ? h('div', { className: 'qqb-row-note' }, `长期事实：${contact.facts.join('；')}`)
            : null,
          contact.note ? h('div', { className: 'qqb-row-note' }, `特别设定：${contact.note}`) : null,
          h('div', { className: 'qqb-row-meta' },
            `${contact.messages || 0} 条消息 · 第一次 ${fmtTime(contact.firstSeen)} · 最近 ${fmtTime(contact.lastSeen)}`,
          ),
          editing
            ? h('div', { className: 'qqb-memory-editor' },
              h('label', { className: 'qqb-field' },
                h('span', { className: 'qqb-field-label' }, '称呼'),
                h('input', { className: 'qqb-input qqb-input-full', value: name, onChange: (event) => setName(event.target.value) }),
              ),
              h('label', { className: 'qqb-field' },
                h('span', { className: 'qqb-field-label' }, '关系'),
                h('input', { className: 'qqb-input qqb-input-full', value: relation, onChange: (event) => setRelation(event.target.value) }),
              ),
              h('label', { className: 'qqb-field' },
                h('span', { className: 'qqb-field-label' }, '别名（用、分隔）'),
                h('input', { className: 'qqb-input qqb-input-full', value: aliases, onChange: (event) => setAliases(event.target.value) }),
              ),
              h('label', { className: 'qqb-field' },
                h('span', { className: 'qqb-field-label' }, '长期事实（一行一条）'),
                h('textarea', { className: 'qqb-input qqb-input-full', rows: 4, value: facts, onChange: (event) => setFacts(event.target.value) }),
              ),
              h('label', { className: 'qqb-field' },
                h('span', { className: 'qqb-field-label' }, '你对 TA 的印象'),
                h('textarea', { className: 'qqb-input qqb-input-full', rows: 3, value: impression, onChange: (event) => setImpression(event.target.value) }),
              ),
              h('div', { className: 'qqb-actions' },
                h('button', { type: 'button', className: 'qqb-btn', onClick: save }, '保存记忆'),
                h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: () => setEditing(false) }, '取消'),
              ),
            )
            : null,
        ),
        h('div', { className: 'qqb-actions' },
          h('button', {
            type: 'button',
            className: 'qqb-btn qqb-btn-ghost',
            onClick: () => setEditing(!editing),
          }, editing ? '收起' : '编辑'),
          h('button', {
            type: 'button',
            className: 'qqb-btn qqb-btn-danger',
            disabled: busy === `clear-${contact.uin}`,
            onClick: () => onClear(contact),
          }, '清空'),
        ),
      );
    }

    function MemoryPageModal({ open, contacts, total, query, loading, rememberAfter, onClose, onSearch, onLoadMore, onSave, onClear, busy }) {
      if (!open) return null;
      return h('div', {
        className: 'qqb-modal-backdrop',
        onClick: (event) => {
          if (event.target === event.currentTarget) onClose();
        },
      },
      h('div', { className: 'qqb-modal qqb-memory-modal' },
        h('div', { className: 'qqb-card-head' },
          h('div', null,
            h('h3', null, '联系人长期记忆'),
            h('p', { className: 'qqb-sub' }, `共 ${total} 人达到 ${rememberAfter || 20} 条消息门槛；这里可以搜索、编辑和清空。`),
          ),
          h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: onClose }, '关闭'),
        ),
        h('div', { className: 'qqb-memory-search' },
          h('input', {
            className: 'qqb-input qqb-input-full',
            defaultValue: query,
            placeholder: '搜索 QQ、称呼、别名或长期事实',
            onKeyDown: (event) => {
              if (event.key === 'Enter') onSearch(event.currentTarget.value);
            },
          }),
          h('button', { type: 'button', className: 'qqb-btn', onClick: (event) => {
            const input = event.currentTarget.parentElement.querySelector('input');
            onSearch(input ? input.value : '');
          } }, '搜索'),
        ),
        loading && contacts.length === 0
          ? h('div', { className: 'qqb-empty' }, '正在读取联系人记忆…')
          : contacts.length === 0
            ? h('div', { className: 'qqb-empty' }, '还没有达到门槛的联系人记忆。')
            : h('div', { className: 'qqb-memory-page-list' }, contacts.map((contact) => h(ContactMemoryCard, {
              key: contact.uin,
              contact,
              onSave,
              onClear,
              busy,
            }))),
        contacts.length < total
          ? h('div', { className: 'qqb-actions' },
            h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', disabled: loading, onClick: onLoadMore }, loading ? '读取中…' : '加载更多'),
          )
          : null,
      ));
    }

    function QQPage() {
      const [status, setStatus] = useState(null);
      const [overview, setOverview] = useState(null);
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [busy, setBusy] = useState('');
      const [evolved, setEvolved] = useState('');
      const [sendType, setSendType] = useState('group');
      const [sendId, setSendId] = useState('');
      const [sendText, setSendText] = useState('');
      const [settings, setSettings] = useState(null);
      const [draft, setDraft] = useState(null);
      const [diary, setDiary] = useState(null);
      const [stickers, setStickers] = useState(null);
      const [stickerManagerOpen, setStickerManagerOpen] = useState(false);
      const [models, setModels] = useState(null);
      const [memoryOpen, setMemoryOpen] = useState(false);
      const [memoryContacts, setMemoryContacts] = useState([]);
      const [memoryTotal, setMemoryTotal] = useState(0);
      const [memoryQuery, setMemoryQuery] = useState('');
      const [memoryLoading, setMemoryLoading] = useState(false);
      const [requests, setRequests] = useState([]);
      const [requestBusy, setRequestBusy] = useState('');
      const [requestFeedback, setRequestFeedback] = useState({});
      const [requestNotice, setRequestNotice] = useState('');
      const [joinedGroups, setJoinedGroups] = useState(null);
      const [groupsLoading, setGroupsLoading] = useState(false);
      const [tab, setTab] = useState('basic');
      const [tokenDirty, setTokenDirty] = useState(false);
      const initialized = useRef(false);
      const settingsInitialized = useRef(false);
      const mounted = useRef(true);

      useEffect(() => () => { mounted.current = false; }, []);

      const loadModels = useCallback(async () => {
        try {
          const data = await api('/models');
          if (mounted.current) setModels(data);
        } catch (failure) {
          if (mounted.current) setModels({ ok: false, groups: [], default: null });
        }
      }, []);

      useEffect(() => {
        void loadModels();
      }, [loadModels]);

      const loadGroups = useCallback(async () => {
        setGroupsLoading(true);
        try {
          const data = await api('/groups');
          if (mounted.current) setJoinedGroups(data);
        } catch (failure) {
          if (mounted.current) {
            setJoinedGroups({
              ok: false,
              groups: [],
              warning: `读取群列表失败：${failure && failure.message ? failure.message : failure}`,
            });
          }
        } finally {
          if (mounted.current) setGroupsLoading(false);
        }
      }, []);

      useEffect(() => {
        void loadGroups();
      }, [loadGroups]);

      useEffect(() => {
        if (tab === 'groups' && status && status.connected) {
          void loadGroups();
        }
      }, [tab, status && status.connected, loadGroups]);

      const selectSearchModel = useCallback((provider, model) => {
        setDraft((previous) => {
          if (!previous) return previous;
          return setIn(setIn(previous, ['search', 'provider'], provider), ['search', 'model'], model);
        });
      }, []);

      const selectVisionModel = useCallback((provider, model) => {
        setDraft((previous) => {
          if (!previous) return previous;
          return setIn(setIn(previous, ['vision', 'provider'], provider), ['vision', 'model'], model);
        });
      }, []);

      const selectChannelModel = useCallback((channel, provider, model) => {
        setDraft((previous) => {
          if (!previous) return previous;
          const base = channel === 'private' ? 'private' : 'group';
          let next = setIn(previous, ['model', base, 'provider'], provider);
          next = setIn(next, ['model', base, 'model'], model);
          return next;
        });
      }, []);

      const load = useCallback(async (silent, refreshEvolved = false) => {
        try {
          const [nextStatus, nextOverview, nextSettings, nextDiary, nextStickers, nextRequests] = await Promise.all([
            api('/status'),
            api('/overview'),
            api('/settings'),
            api('/diary').catch(() => null),
            api('/stickers').catch(() => null),
            api('/requests').catch(() => null),
          ]);
          if (!mounted.current) return;
          setStatus(nextStatus);
          setOverview(nextOverview);
          if (nextDiary && nextDiary.ok) setDiary(nextDiary);
          if (nextStickers && nextStickers.ok) setStickers(nextStickers);
          if (nextRequests && nextRequests.ok) {
            const nextList = nextRequests.requests || [];
            setRequests(nextList);
            const live = new Set(nextList.map((item) => item.flag));
            setRequestFeedback((previous) => {
              const kept = {};
              for (const [flag, value] of Object.entries(previous)) {
                if (live.has(flag)) kept[flag] = value;
              }
              return kept;
            });
          }
          const loadedSettings = nextSettings && nextSettings.settings;
          if (loadedSettings) {
            setSettings(loadedSettings);
            if (!settingsInitialized.current) {
              setDraft(loadedSettings);
              settingsInitialized.current = true;
            }
          }
          // Silent polls must not wipe a failure the user still needs to read;
          // only an explicit (user driven) load clears the page-level error.
          if (!silent) setError('');
          if ((!initialized.current || refreshEvolved) && nextOverview.persona) {
            setEvolved(nextOverview.persona.evolved || '');
            initialized.current = true;
          }
        } catch (failure) {
          if (!mounted.current) return;
          if (!silent) {
            setError(`无法读取 QQ 桥状态：${failure && failure.message ? failure.message : failure}`);
          }
        }
      }, []);

      useEffect(() => {
        void load(false);
        const timer = setInterval(() => { void load(true); }, 6000);
        return () => clearInterval(timer);
      }, [load]);

      const run = async (name, operation) => {
        setBusy(name);
        setNotice('');
        try {
          await operation();
        } catch (failure) {
          setError(failure && failure.message ? failure.message : String(failure));
        } finally {
          if (mounted.current) setBusy('');
        }
      };

      const reconnect = () => run('reconnect', async () => {
        await post('/reconnect');
        await load(true);
        setNotice('已请求重新连接 OneBot。');
      });

      const saveAll = () => run('settings', async () => {
        if (!draft) throw new Error('设置尚未加载');
        const body = JSON.parse(JSON.stringify(draft));
        const activePresetId = body.persona && body.persona.activePreset;
        if (activePresetId && Array.isArray(body.persona.presets)) {
          body.persona.presets = body.persona.presets.map((preset) => (preset.id === activePresetId
            ? {
              ...preset,
              name: String(body.persona.name || preset.name || '').trim() || preset.name,
              identity: body.persona.identity || '',
              style: body.persona.style || '',
              rules: body.persona.rules || '',
              examples: (body.persona.examples || []).map((row) => ({ ...row })),
            }
            : preset));
        }
        delete body.settingsPath;
        delete body.overridden;
        if (!tokenDirty && body.connection) delete body.connection.accessToken;
        const result = await post('/settings', body);
        setSettings(result.settings);
        setDraft(result.settings);
        setTokenDirty(false);
        if (result.warning) {
          setError(result.warning);
          setNotice('设置已保存，但模型配置需要检查。');
        } else {
          setNotice('设置已保存。模型 / preset 变更会在下一条消息重建智能体。');
        }
        await load(true, true);
      });

      const writeDiaryNow = () => run('diary', async () => {
        const result = await post('/diary');
        if (!result || result.ok === false) {
          throw new Error(result && result.error ? result.error : '写日记失败');
        }
        setNotice('日记已更新。');
        await load(true);
      });

      const syncStickers = () => run('stickers', async () => {
        const result = await post('/stickers/sync');
        if (!result || result.ok === false) {
          throw new Error(result && result.message ? result.message : '同步表情失败');
        }
        setNotice(result.message || '表情同步完成。');
        await load(true);
      });

      const autoTagStickers = () => run('autotag', async () => {
        const result = await post('/stickers/autotag', { limit: 20 });
        if (!result || result.ok === false) {
          throw new Error(result && result.error ? result.error : '自动识别失败');
        }
        setNotice(result.message || '已加入自动识别队列。');
        await load(true);
      });

      const saveStickerTag = async (id, tags, description) => {
        try {
          const result = await post('/stickers/tag', { id, tags, description });
          if (result.item) {
            setStickers((previous) => {
              if (!previous) return previous;
              return {
                ...previous,
                items: previous.items.map((item) => (item.id === result.item.id ? { ...item, ...result.item } : item)),
              };
            });
            setNotice(`已保存 ${id} 的标签。`);
          }
        } catch (failure) {
          setError(failure && failure.message ? failure.message : String(failure));
        }
      };

      const deleteSticker = (item) => run('sticker-delete', async () => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(`删除表情 ${item.id}${item.description ? `（${item.description}）` : ''}？`)) {
          return;
        }
        const result = await post('/stickers/delete', { id: item.id });
        if (!result || result.ok === false) {
          throw new Error(result && result.error ? result.error : '删除失败');
        }
        setStickers((previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            count: Math.max(0, (previous.count || previous.items.length) - 1),
            items: previous.items.filter((entry) => entry.id !== item.id),
          };
        });
        setNotice(result.message || `已删除表情 ${item.id}。`);
        await load(true);
      });

      const deleteStickerBatch = (ids) => run('sticker-batch', async () => {
        const list = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
        if (list.length === 0) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(`删除选中的 ${list.length} 张表情？`)) {
          return;
        }
        const result = await post('/stickers/delete-batch', { ids: list });
        if (!result || result.ok === false) {
          throw new Error(result && result.error ? result.error : '批量删除失败');
        }
        const removed = new Set(result.removed || list);
        setStickers((previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            count: Math.max(0, (previous.count || previous.items.length) - removed.size),
            items: previous.items.filter((entry) => !removed.has(entry.id)),
          };
        });
        setNotice(result.message || `已删除 ${removed.size} 张表情。`);
        await load(true);
      });

      const savePersona = () => run('persona', async () => {
        const result = await post('/persona', { evolved });
        if (result && result.persona) {
          setOverview((previous) => (previous ? { ...previous, persona: result.persona } : previous));
        }
        setNotice('自我认知已保存，下一条回复起生效。');
      });

      const evolveNow = () => run('evolve', async () => {
        const result = await post('/evolve');
        if (result && result.persona) {
          setEvolved(result.persona.evolved || '');
          setOverview((previous) => (previous ? { ...previous, persona: result.persona } : previous));
        }
        if (result && result.disabled) {
          setNotice(result.message || '人设演化已关闭。');
          return;
        }
        setNotice(result && result.evolved ? '人设已根据长期记忆更新。' : '素材还不够，暂时没有新的演化结果。');
      });

      // The master switch is a setting, so it is written on its own instead of
      // riding on the full settings form; other unsaved edits stay untouched.
      const toggleEvolution = (next) => run('evolve-switch', async () => {
        const result = await post('/settings', { persona: { evolution: Boolean(next) } });
        if (!result || result.ok === false) {
          throw new Error(result && result.error ? result.error : '保存人设演化开关失败');
        }
        setSettings((previous) => (result.settings ? result.settings : previous));
        setDraft((previous) => (previous ? setIn(previous, ['persona', 'evolution'], Boolean(next)) : previous));
        setOverview((previous) => (previous && previous.persona
          ? { ...previous, persona: { ...previous.persona, evolution: Boolean(next) } }
          : previous));
        setNotice(next
          ? '人设演化已开启：继续根据长期交流更新自我认知。'
          : '人设演化已关闭：不再演化，自我认知也不再进入提示词。文本保留，随时可以打开。');
      });

      const loadMemoryContacts = useCallback(async (query, offset = 0) => {
        setMemoryLoading(true);
        try {
          const params = new URLSearchParams({ limit: '40', offset: String(offset || 0), q: String(query || '') });
          const data = await api(`/memory/contacts?${params.toString()}`);
          if (!mounted.current) return;
          setMemoryTotal(Number(data.total) || 0);
          setMemoryQuery(String(query || ''));
          setMemoryContacts((previous) => (offset > 0 ? [...previous, ...(data.contacts || [])] : (data.contacts || [])));
        } catch (failure) {
          if (mounted.current) setError(failure && failure.message ? failure.message : String(failure));
        } finally {
          if (mounted.current) setMemoryLoading(false);
        }
      }, []);

      const openMemory = () => {
        setMemoryOpen(true);
        void loadMemoryContacts('', 0);
      };

      const clearContact = (contact) => run(`clear-${contact.uin}`, async () => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(`清空对 ${contact.name || contact.uin} 的记忆？`)) {
          return;
        }
        const result = await post('/memory/clear', { uin: contact.uin });
        if (result && result.overview) setOverview(result.overview);
        setNotice(`已清空 ${contact.name || contact.uin} 的记忆。`);
        if (memoryOpen) await loadMemoryContacts(memoryQuery, 0);
      });

      const saveContactMemory = (uin, data) => run(`memory-${uin}`, async () => {
        const result = await post('/memory/contact', { uin, ...data });
        if (result && result.overview) setOverview(result.overview);
        setNotice(`已更新 QQ ${uin} 的长期记忆。`);
        if (memoryOpen) await loadMemoryContacts(memoryQuery, 0);
      });

      // One request per row: approve / reject go to QQ over OneBot, ignore is a
      // local dismissal (the flag keeps pending on the QQ side until it expires).
      // Every failure is reported inline on the row, right where the click
      // happened, because the page-level alert sits above the fold.
      const noteRequest = (flag, tone, text) => {
        if (!mounted.current) return;
        setRequestFeedback((previous) => {
          if (!text) {
            const next = { ...previous };
            delete next[flag];
            return next;
          }
          return { ...previous, [flag]: { tone, text } };
        });
      };

      const resolveQqRequest = async (request, action) => {
        const flag = request.flag;
        if (requestBusy) return;
        setRequestBusy(flag);
        setNotice('');
        setRequestNotice('');
        noteRequest(flag, 'busy', action === 'ignore' ? '正在忽略…' : '正在发送到 QQ…');
        try {
          const result = await post('/requests/action', { flag, action });
          if (!result || result.ok === false) {
            throw new Error(result && result.error ? result.error : '处理请求失败');
          }
          if (Array.isArray(result.requests)) {
            setRequests(result.requests);
            noteRequest(flag, '', '');
          }
          setNotice(result.message || ({ approve: '已同意请求。', reject: '已拒绝请求。', ignore: '已忽略请求。' }[action] || '处理完成。'));
        } catch (failure) {
          noteRequest(flag, 'error', failure && failure.message ? failure.message : String(failure));
        } finally {
          if (mounted.current) setRequestBusy('');
        }
      };

      const ignoreAllRequests = async () => {
        if (requests.length === 0 || requestBusy) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(`忽略 ${requests.length} 条请求？只从列表移除，不会向 QQ 发送任何操作。`)) {
          return;
        }
        const flags = requests.map((item) => item.flag);
        setRequestBusy('all');
        setNotice('');
        setRequestNotice('');
        setRequestFeedback((previous) => {
          const next = { ...previous };
          for (const flag of flags) next[flag] = { tone: 'busy', text: '正在忽略…' };
          return next;
        });
        try {
          for (const flag of flags) {
            await post('/requests/action', { flag, action: 'ignore' });
          }
          if (!mounted.current) return;
          setRequests((previous) => previous.filter((item) => !flags.includes(item.flag)));
          setRequestFeedback({});
          setRequestNotice(`已忽略 ${flags.length} 条请求。`);
        } catch (failure) {
          if (!mounted.current) return;
          setRequestNotice(`忽略过程中出错：${failure && failure.message ? failure.message : failure}`);
          try {
            const refreshed = await api('/requests');
            if (mounted.current && refreshed && refreshed.ok) {
              setRequests(refreshed.requests || []);
              setRequestFeedback({});
            }
          } catch {
            setRequestFeedback((previous) => {
              const next = { ...previous };
              for (const flag of flags) {
                if (next[flag] && next[flag].tone === 'busy') delete next[flag];
              }
              return next;
            });
          }
        } finally {
          if (mounted.current) setRequestBusy('');
        }
      };

      const clearGroup = (group) => run(`clear-${group.id}`, async () => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(`清空群 ${group.name || group.id} 的记忆？`)) {
          return;
        }
        const result = await post('/memory/clear', { groupId: group.id });
        if (result && result.overview) setOverview(result.overview);
        setNotice(`已清空群 ${group.name || group.id} 的记忆。`);
      });

      const sendTest = () => run('send', async () => {
        if (!sendId.trim()) throw new Error('请填写群号或 QQ 号');
        if (!sendText.trim()) throw new Error('请填写要发送的文字');
        await post('/send', {
          targetType: sendType,
          targetId: sendId.trim(),
          text: sendText.trim(),
        });
        setSendText('');
        setNotice('测试消息已交给 OneBot 发送。');
      });

      const contacts = (overview && overview.contacts) || [];
      const groups = (overview && overview.groups) || [];
      const persona = (overview && overview.persona) || null;
      const config = (status && status.config) || null;
      // One source of truth for the switch: the settings draft first (it is what
      // the save button would write), then the live overview/status mirrors.
      const evolutionOn = (() => {
        const fromDraft = draft && draft.persona ? draft.persona.evolution : undefined;
        if (typeof fromDraft === 'boolean') return fromDraft;
        if (persona && typeof persona.evolution === 'boolean') return persona.evolution;
        if (config && typeof config.evolution === 'boolean') return config.evolution;
        return true;
      })();

      return h('div', { className: 'qqb-page' },
        h('style', null, CSS),

        h('header', { className: 'qqb-head' },
          h('div', null,
            h('h2', { className: 'qqb-title' }, 'QQ 聊天接入'),
            h('p', { className: 'qqb-sub' },
              '把 DeepSeek Harness 的智能体接到 QQ：OneBot 连接、底层人设、长期记忆、联网工具与分段回复。',
            ),
          ),
          h(Badge, { status }),
        ),

        error ? h('div', { className: 'qqb-alert qqb-alert-error' }, error) : null,
        notice ? h('div', { className: 'qqb-alert qqb-alert-ok' }, notice) : null,

        h('div', { className: 'qqb-grid' },
          h('section', { className: 'qqb-card' },
            h('div', { className: 'qqb-card-head' },
              h('h3', null, '运行状态'),
              h('button', {
                type: 'button',
                className: 'qqb-btn qqb-btn-ghost',
                disabled: busy === 'reconnect' || !status || !status.connected,
                onClick: reconnect,
              }, busy === 'reconnect' ? '重连中…' : '重连'),
            ),
            status
              ? h('div', { className: 'qqb-fields' },
                h(Field, { label: '登录账号', value: status.selfId ? `${status.nickname || '未知昵称'}（${status.selfId}）` : '尚未登录' }),
                h(Field, { label: '默认模型', value: status.model, mono: true }),
                h(Field, {
                  label: '私聊模型',
                  value: (() => {
                    const configured = status.channelModels && status.channelModels.private;
                    if (!configured) return '未创建（发一条私聊后显示）';
                    const effort = status.channelEfforts && status.channelEfforts.private;
                    const actual = status.channelActualModels && status.channelActualModels.private;
                    const actualEffort = status.channelActualEfforts && status.channelActualEfforts.private;
                    const mismatch = actual && actual !== configured
                      ? ` → 实际 ${actual}${actualEffort ? ` · ${actualEffort}` : ''}`
                      : '';
                    return `${configured}${effort ? ` · ${effort}` : ''}${mismatch}`;
                  })(),
                  mono: true,
                }),
                h(Field, {
                  label: '群聊模型',
                  value: (() => {
                    const configured = status.channelModels && status.channelModels.group;
                    if (!configured) return '未创建（发一条群聊后显示）';
                    const effort = status.channelEfforts && status.channelEfforts.group;
                    const actual = status.channelActualModels && status.channelActualModels.group;
                    const actualEffort = status.channelActualEfforts && status.channelActualEfforts.group;
                    const mismatch = actual && actual !== configured
                      ? ` → 实际 ${actual}${actualEffort ? ` · ${actualEffort}` : ''}`
                      : '';
                    return `${configured}${effort ? ` · ${effort}` : ''}${mismatch}`;
                  })(),
                  mono: true,
                }),
                h(Field, { label: '智能体', value: status.agentReady ? '已就绪' : '尚未创建' }),
                h(Field, { label: '本次在线', value: status.connected ? fmtUptime(status.uptimeMs) : '—' }),
                h(Field, { label: '已回复', value: String(status.counters ? status.counters.replies : 0) }),
                h(Field, { label: '记忆', value: `${status.memory ? status.memory.contacts : 0} 人 / ${status.memory ? status.memory.groups : 0} 群` }),
                h(Field, { label: 'OneBot', value: status.wsUrl, mono: true }),
              )
              : h('div', { className: 'qqb-empty' }, '正在读取状态…'),
            status && status.lastError
              ? h('div', { className: 'qqb-hint qqb-hint-error' }, `最近错误：${status.lastError}`)
              : null,
          ),

          h('section', { className: 'qqb-card' },
            h('h3', null, '配置说明'),
            h('p', { className: 'qqb-sub' },
              '模型、底层人设、唤醒词、分段回复、记忆与访问控制都在下方「参数设置」里修改，保存到 settings.json 并立即生效。',
            ),
            h('div', { className: 'qqb-code' }, '本页「参数设置」→ 保存设置'),
            h('div', { className: 'qqb-fields qqb-fields-tight' },
              h(Field, { label: '人设名', value: config ? config.personaName : '—' }),
              h(Field, { label: '唤醒词', value: config && config.wakeWords && config.wakeWords.length ? config.wakeWords.join(' / ') : '未设置' }),
              h(Field, { label: '分段回复', value: config ? (config.split ? '开启' : '关闭') : '—' }),
              h(Field, { label: '群上下文', value: config ? `${config.groupContext} 条` : '—' }),
              h(Field, { label: '人设演化', value: evolutionOn ? '开启' : '关闭' }),
              h(Field, { label: '自动演化', value: config ? (config.autoEvolve ? '开启' : '关闭') : '—' }),
            ),
            h('p', { className: 'qqb-hint' },
              'QQ 账号由 NapCat / Lagrange 登录，本插件只连接 OneBot，不保存 QQ 密码。',
            ),
          ),
        ),

        h(SettingsPanel, {
          draft,
          setDraft,
          onSave: saveAll,
          busy,
          tab,
          setTab,
          tokenDirty,
          setTokenDirty,
          models,
          onSelectSearchModel: selectSearchModel,
          onSelectVisionModel: selectVisionModel,
          onSelectChannelModel: selectChannelModel,
          onRefreshModels: loadModels,
          joinedGroups,
          groupsLoading,
          onRefreshGroups: loadGroups,
          contacts,
          requestCount: requests.length,
          connected: Boolean(status && status.connected),
        }),

        tab === 'groups'
          ? h(GroupMemoryPanel, { groups, onClear: clearGroup, busy })
          : null,

        tab === 'persona'
          ? h(PresetDialogues, {
            draft,
            setDraft,
            onSave: saveAll,
            busy,
          })
          : null,

        tab === 'security' ? h('section', { className: 'qqb-card' },
          h('div', { className: 'qqb-card-head' },
            h('div', null,
              h('h3', null, 'QQ 好友 / 群请求'),
              h('p', { className: 'qqb-sub' },
                '「同意 / 拒绝」会立刻发送给 QQ；「忽略」只把这条从列表移除，不向 QQ 发送任何操作。',
              ),
            ),
            h('div', { className: 'qqb-actions' },
              requests.length > 0
                ? h('button', {
                  type: 'button',
                  className: 'qqb-btn qqb-btn-ghost',
                  disabled: requestBusy !== '',
                  onClick: () => { void ignoreAllRequests(); },
                }, requestBusy === 'all' ? '忽略中…' : '全部忽略')
                : null,
              h('span', { className: 'qqb-count' }, `${requests.length} 个待处理`),
            ),
          ),
          requestNotice
            ? h('div', { className: 'qqb-row-feedback qqb-row-feedback-ok' }, requestNotice)
            : null,
          status && status.connected === false
            ? h('div', { className: 'qqb-row-feedback qqb-row-feedback-error' },
              `OneBot 未连接（${status.wsUrl || '未配置'}）：「同意 / 拒绝」暂时送不到 QQ，点了会在这里报错；可以先「忽略」把请求移出列表，等 NapCat 恢复后重新发起。`,
            )
            : null,
          requests.length === 0
            ? h('div', { className: 'qqb-empty' }, '暂无待处理的好友或群请求。')
            : h('div', { className: 'qqb-list' }, requests.map((request) => {
              const feedback = requestFeedback[request.flag];
              const rowBusy = requestBusy === request.flag || requestBusy === 'all';
              return h('div', {
                className: `qqb-row${feedback && feedback.tone === 'error' ? ' qqb-row-has-error' : ''}`,
                key: request.flag,
              },
              h('div', { className: 'qqb-row-main' },
                h('div', { className: 'qqb-row-title' },
                  request.type === 'friend' ? '好友请求' : (request.subType === 'invite' ? '群邀请' : '加群请求'),
                  h('span', { className: 'qqb-muted' }, ` ${request.name || ''} (${request.userId})`),
                ),
                request.groupId ? h('div', { className: 'qqb-row-note' }, `群号：${request.groupId}`) : null,
                request.comment ? h('div', { className: 'qqb-row-text' }, request.comment) : null,
                h('div', { className: 'qqb-row-meta' }, `flag: ${request.flag} · ${fmtTime(request.receivedAt)}${fmtRequestAge(request.receivedAt)}`),
                feedback
                  ? h('div', { className: `qqb-row-feedback qqb-row-feedback-${feedback.tone}` }, feedback.text)
                  : null,
              ),
              h('div', { className: 'qqb-actions' },
                h('button', {
                  type: 'button',
                  className: 'qqb-btn',
                  disabled: rowBusy,
                  onClick: () => { void resolveQqRequest(request, 'approve'); },
                }, '同意'),
                h('button', {
                  type: 'button',
                  className: 'qqb-btn qqb-btn-danger',
                  disabled: rowBusy,
                  onClick: () => { void resolveQqRequest(request, 'reject'); },
                }, '拒绝'),
                h('button', {
                  type: 'button',
                  className: 'qqb-btn qqb-btn-ghost',
                  disabled: rowBusy,
                  onClick: () => { void resolveQqRequest(request, 'ignore'); },
                }, '忽略'),
              ),
              );
            })),
        ) : null,

        tab === 'content' ? h(DiaryPanel, {
          diary,
          onWrite: writeDiaryNow,
          onRefresh: () => { void load(true); },
          busy: busy === 'diary',
        }) : null,

        tab === 'abilities' ? h(StickerPanel, {
          stickers,
          onOpen: () => setStickerManagerOpen(true),
          onSync: syncStickers,
          onRefresh: () => { void load(true); },
          onAutoTag: autoTagStickers,
          autoTagging: busy === 'autotag',
          busy: busy === 'stickers',
        }) : null,

        h(StickerManager, {
          open: stickerManagerOpen,
          stickers,
          onClose: () => setStickerManagerOpen(false),
          onSync: syncStickers,
          onRefresh: () => { void load(true); },
          onTag: saveStickerTag,
          onDelete: deleteSticker,
          onDeleteBatch: deleteStickerBatch,
          onAutoTag: autoTagStickers,
          autoTagging: busy === 'autotag',
          busy: busy === 'stickers',
        }),

        tab === 'persona' ? h('section', { className: 'qqb-card' },
          h('div', { className: 'qqb-card-head' },
            h('div', null,
              h('h3', null, '人设演化'),
              h('p', { className: 'qqb-sub' },
                evolutionOn
                  ? '底层人设在下方「参数设置」里；这里显示并编辑机器人在长期交流中形成的“自我认知”。'
                  : '演化已关闭：机器人只按底层人设说话，自我认知不进入提示词。下面的文本保留，随时可以打开。',
              ),
            ),
            h('div', { className: 'qqb-actions' },
              h(Switch, {
                checked: evolutionOn,
                disabled: busy === 'evolve-switch' || !settingsInitialized.current,
                onLabel: '演化开启',
                offLabel: '演化关闭',
                title: '关闭后不再自动演化，已形成的自我认知也不再发给模型',
                onChange: toggleEvolution,
              }),
              h('button', {
                type: 'button',
                className: 'qqb-btn qqb-btn-ghost',
                disabled: busy === 'evolve' || !evolutionOn,
                title: evolutionOn ? '' : '先打开「人设演化」开关',
                onClick: evolveNow,
              }, busy === 'evolve' ? '演化中…' : '立即演化'),
              h('button', {
                type: 'button',
                className: 'qqb-btn',
                disabled: busy === 'persona' || !initialized.current,
                onClick: savePersona,
              }, busy === 'persona' ? '保存中…' : '保存'),
            ),
          ),
          h('textarea', {
            className: 'qqb-textarea',
            rows: 5,
            value: evolved,
            placeholder: '还没有形成自我认知。多聊一段时间，或点“立即演化”。',
            onChange: (event) => setEvolved(event.target.value),
          }),
          persona
            ? h('div', { className: 'qqb-fields qqb-fields-tight' },
              h(Field, { label: '累计互动', value: String(persona.interactions || 0) }),
              h(Field, { label: '最近更新', value: fmtTime(persona.updatedAt) }),
            )
            : null,
          persona && persona.identity
            ? h('details', { className: 'qqb-details' },
              h('summary', null, '查看底层人设（只读）'),
              h('pre', { className: 'qqb-pre' }, persona.identity),
            )
            : null,
        ) : null,

        tab === 'memory' ? h('section', { className: 'qqb-card' },
          h('div', { className: 'qqb-card-head' },
            h('div', null,
              h('h3', null, '记忆区'),
              h('p', { className: 'qqb-sub' },
                '只显示最近 3 个达到长期记忆门槛的联系人；更多请打开单独页面。',
              ),
            ),
            h('div', { className: 'qqb-actions' },
              h('span', { className: 'qqb-count' }, `${contacts.length} 人`),
              h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost', onClick: openMemory }, '查看更多'),
            ),
          ),
          h('div', null,
            h('div', null,
              h('h4', { className: 'qqb-subhead' }, '联系人（前 3 个）'),
              contacts.length === 0
                ? h('div', { className: 'qqb-empty' }, '还没有达到长期记忆门槛的联系人。')
                : h('div', { className: 'qqb-list' }, contacts.slice(0, 3).map((contact) => h(ContactMemoryCard, {
                  key: contact.uin,
                  contact,
                  onSave: saveContactMemory,
                  onClear: clearContact,
                  busy,
                }))),
              contacts.length > 3
                ? h('button', { type: 'button', className: 'qqb-btn qqb-btn-ghost qqb-memory-more', onClick: openMemory }, `查看其余 ${contacts.length - 3} 人`)
                : null,
            ),
          ),
        ) : null,

        h(MemoryPageModal, {
          open: memoryOpen,
          contacts: memoryContacts,
          total: memoryTotal,
          query: memoryQuery,
          loading: memoryLoading,
          rememberAfter: (settings && settings.memory && settings.memory.rememberAfter)
            || (draft && draft.memory && draft.memory.rememberAfter)
            || 20,
          onClose: () => setMemoryOpen(false),
          onSearch: (query) => { void loadMemoryContacts(query, 0); },
          onLoadMore: () => { void loadMemoryContacts(memoryQuery, memoryContacts.length); },
          onSave: saveContactMemory,
          onClear: clearContact,
          busy,
        }),

        tab === 'connection' ? h('section', { className: 'qqb-card' },
          h('h3', null, '发送测试消息'),
          h('p', { className: 'qqb-sub' }, '绕过智能体，直接经 OneBot 发一条消息，用来确认连接和权限。'),
          h('div', { className: 'qqb-send' },
            h('select', {
              className: 'qqb-input qqb-select',
              value: sendType,
              onChange: (event) => setSendType(event.target.value),
            },
            h('option', { value: 'group' }, '群聊'),
            h('option', { value: 'private' }, '私聊'),
            ),
            h('input', {
              className: 'qqb-input',
              value: sendId,
              placeholder: sendType === 'group' ? '群号' : 'QQ 号',
              onChange: (event) => setSendId(event.target.value),
            }),
            h('input', {
              className: 'qqb-input qqb-input-grow',
              value: sendText,
              placeholder: '要发送的文字',
              onChange: (event) => setSendText(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !(event.nativeEvent && event.nativeEvent.isComposing)) sendTest();
              },
            }),
            h('button', {
              type: 'button',
              className: 'qqb-btn',
              disabled: busy === 'send',
              onClick: sendTest,
            }, busy === 'send' ? '发送中…' : '发送'),
          ),
          h('p', { className: 'qqb-hint' },
            `数据目录：${status && status.dataDir ? status.dataDir : '~/.dsh-qq-bot'}`,
          ),
        ) : null,
      );
    }

    const CSS = `
      .qqb-page { display:flex; flex-direction:column; gap:14px; padding:2px 0 36px; color:var(--dsw-alias-label-primary); }
      .qqb-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
      .qqb-title { margin:0 0 6px; font-size:20px; font-weight:600; letter-spacing:0; }
      .qqb-sub { margin:0; color:var(--dsw-alias-label-secondary); font-size:13px; line-height:1.65; }
      .qqb-badge { display:inline-flex; align-items:center; gap:7px; flex:none; padding:5px 11px; border-radius:999px; font-size:12px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-secondary); }
      .qqb-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-state-idle-primary); }
      .qqb-badge-ok .qqb-dot { background:var(--dsw-alias-state-success-primary); }
      .qqb-badge-ok { color:var(--dsw-alias-state-success-primary); }
      .qqb-badge-err .qqb-dot { background:var(--dsw-alias-state-error-primary); }
      .qqb-badge-err { color:var(--dsw-alias-state-error-primary); }
      .qqb-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; }
      .qqb-card { display:flex; flex-direction:column; gap:10px; padding:16px; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; }
      .qqb-card h3 { margin:0; font-size:14px; font-weight:600; }
      .qqb-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .qqb-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px 16px; }
      .qqb-fields-tight { margin-top:2px; }
      .qqb-field { display:flex; flex-direction:column; gap:3px; min-width:0; }
      .qqb-field-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
      .qqb-field-value { font-size:13px; overflow-wrap:anywhere; }
      .qqb-mono { font-family:ui-monospace,Consolas,"Courier New",monospace; font-size:12px; }
      .qqb-hint { margin:0; font-size:12px; line-height:1.6; color:var(--dsw-alias-label-secondary); }
      .qqb-hint-error { color:var(--dsw-alias-state-error-primary); }
      .qqb-alert { padding:10px 12px; border-radius:10px; font-size:13px; line-height:1.5; border:1px solid var(--dsw-alias-border-l1); }
      .qqb-alert-error { color:var(--dsw-alias-state-error-primary); background:var(--dsw-alias-bg-layer-1); }
      .qqb-alert-ok { color:var(--dsw-alias-state-success-primary); background:var(--dsw-alias-bg-layer-1); }
      .qqb-code { padding:9px 11px; border-radius:8px; background:var(--dsw-alias-bg-layer-2); font-family:ui-monospace,Consolas,monospace; font-size:12px; }
      .qqb-tabs { display:flex; flex-wrap:wrap; gap:6px; }
      .qqb-settings-layout { display:grid; grid-template-columns:170px minmax(0,1fr); gap:18px; align-items:start; }
      .qqb-settings-nav { display:flex; flex-direction:column; gap:3px; position:sticky; top:12px; padding:6px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); }
      .qqb-settings-nav-item { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; padding:8px 10px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; text-align:left; cursor:pointer; }
      .qqb-settings-nav-item:hover { background:var(--dsw-alias-bg-layer-2); }
      .qqb-settings-nav-item-active { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-border-l2); font-weight:600; }
      .qqb-settings-content { display:flex; flex-direction:column; gap:14px; min-width:0; }
      .qqb-settings-footer { display:flex; align-items:center; justify-content:flex-end; gap:10px; padding-top:10px; border-top:1px solid var(--dsw-alias-border-l1); }
      @media (max-width:760px) {
        .qqb-settings-layout { grid-template-columns:1fr; gap:10px; }
        .qqb-settings-nav { flex-direction:row; overflow:auto; position:static; }
        .qqb-settings-nav-item { width:auto; white-space:nowrap; }
      }
      .qqb-model-picker { display:flex; flex-direction:column; gap:8px; }
      .qqb-model-trigger { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; padding:10px 12px; border:1px solid var(--dsw-alias-border-l2); border-radius:10px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font:inherit; text-align:left; cursor:pointer; }
      .qqb-model-trigger-main { display:flex; flex-direction:column; gap:2px; min-width:0; }
      .qqb-model-name { font-size:13px; font-weight:600; }
      .qqb-model-sub { font-size:11px; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
      .qqb-model-chevron { color:var(--dsw-alias-label-secondary); font-size:12px; flex:none; }
      .qqb-model-list { display:flex; flex-direction:column; gap:2px; max-height:380px; overflow:auto; padding:6px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); }
      .qqb-model-group { display:flex; flex-direction:column; gap:2px; padding:4px 0; }
      .qqb-model-group-name { font-size:11px; color:var(--dsw-alias-label-secondary); padding:4px 8px; }
      .qqb-model-row { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; padding:8px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--dsw-alias-label-primary); font:inherit; text-align:left; cursor:pointer; }
      .qqb-model-row:hover { background:var(--dsw-alias-bg-layer-2); }
      .qqb-model-row-active { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-border-l2); }
      .qqb-model-row-name { font-size:13px; }
      .qqb-model-row-sub { font-size:11px; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
      .qqb-model-check { color:var(--dsw-alias-brand-primary); font-weight:700; flex:none; }
      .qqb-group-picker { display:flex; flex-direction:column; gap:8px; }
      .qqb-group-picker-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .qqb-group-list { display:flex; flex-direction:column; gap:4px; max-height:340px; overflow:auto; padding:4px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); }
      .qqb-group-row { display:flex; align-items:flex-start; gap:8px; padding:8px; border:1px solid transparent; border-radius:8px; }
      .qqb-group-row:hover { background:var(--dsw-alias-bg-layer-2); }
      .qqb-group-row-active { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-border-l2); }
      .qqb-group-main { display:flex; flex-direction:column; gap:2px; min-width:0; }
      .qqb-group-name { font-size:13px; overflow-wrap:anywhere; }
      .qqb-group-meta { font-size:11px; color:var(--dsw-alias-label-secondary); }
      .qqb-persona-presets { display:flex; flex-direction:column; gap:8px; }
      .qqb-persona-preset-row { display:flex; align-items:center; gap:8px; }
      .qqb-persona-preset-create { display:flex; flex-direction:column; gap:6px; padding:8px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:var(--dsw-alias-bg-layer-2); }
      .qqb-tab { appearance:none; border:1px solid transparent; border-radius:999px; padding:5px 11px; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; cursor:pointer; }
      .qqb-tab:hover { background:var(--dsw-alias-bg-layer-2); }
      .qqb-tab-active { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); }
      .qqb-form-groups { display:flex; flex-direction:column; gap:16px; }
      .qqb-form-group { display:flex; flex-direction:column; gap:8px; }
      .qqb-form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px 14px; }
      .qqb-capability { padding:14px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-2); }
      .qqb-form-group-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .qqb-capability-title { display:flex; flex-direction:column; gap:2px; min-width:0; }
      .qqb-capability-title .qqb-subhead { margin:0; }
      .qqb-image-tester { display:flex; flex-direction:column; gap:10px; margin-top:6px; padding-top:10px; border-top:1px dashed var(--dsw-alias-border-l1); }
      .qqb-image-searchbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .qqb-image-sendbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .qqb-image-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
      .qqb-image-card { display:flex; flex-direction:column; gap:6px; padding:8px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); }
      .qqb-image-thumb { width:100%; height:120px; object-fit:cover; border-radius:8px; background:var(--dsw-alias-bg-layer-2); }
      .qqb-image-thumb-empty { display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--dsw-alias-label-secondary); }
      .qqb-image-title { font-size:12px; line-height:1.5; color:var(--dsw-alias-label-primary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .qqb-image-meta { font-size:10px; color:var(--dsw-alias-label-secondary); font-family:ui-monospace,Consolas,monospace; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .qqb-form-row { display:flex; flex-direction:column; gap:4px; min-width:0; }
      .qqb-form-label { font-size:12px; color:var(--dsw-alias-label-secondary); line-height:1.45; }
      .qqb-field-hint { display:block; font-size:11px; opacity:.78; margin-top:2px; }
      .qqb-input-full { width:100%; }
      .qqb-textarea-sm { min-height:64px; }
      .qqb-check { display:flex; align-items:flex-start; gap:7px; min-height:32px; padding-top:7px; font-size:12px; color:var(--dsw-alias-label-secondary); line-height:1.45; cursor:pointer; }
      .qqb-check input { margin-top:1px; accent-color:var(--dsw-alias-brand-primary); }
      .qqb-examples { gap:12px; }
      .qqb-examples-heading { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .qqb-examples-icon { font-size:16px; line-height:1; }
      .qqb-count-badge { min-width:20px; height:20px; padding:0 6px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-brand-primary); font-size:11px; display:inline-flex; align-items:center; justify-content:center; }
      .qqb-example-list { display:flex; flex-direction:column; gap:10px; }
      .qqb-example { display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-2); }
      .qqb-example-fields { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
      .qqb-example-field { display:flex; flex-direction:column; gap:4px; }
      .qqb-icon-btn { flex:none; width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--dsw-alias-state-error-primary); font-size:15px; cursor:pointer; }
      .qqb-icon-btn:hover { background:var(--dsw-alias-bg-layer-1); border-color:var(--dsw-alias-border-l1); }
      .qqb-textarea { width:100%; box-sizing:border-box; resize:vertical; min-height:96px; padding:10px 12px; border-radius:10px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; line-height:1.6; outline:none; }
      .qqb-textarea:focus { border-color:var(--dsw-alias-brand-primary); }
      .qqb-actions { display:flex; gap:8px; flex:none; align-items:center; }
      .qqb-switch { position:relative; display:inline-flex; align-items:center; gap:7px; flex:none; cursor:pointer; user-select:none; }
      .qqb-switch input { position:absolute; width:1px; height:1px; opacity:0; margin:0; pointer-events:none; }
      .qqb-switch-track { position:relative; box-sizing:border-box; width:34px; height:18px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l2); transition:background .16s ease, border-color .16s ease; flex:none; }
      .qqb-switch-knob { position:absolute; top:2px; left:2px; width:12px; height:12px; border-radius:50%; background:var(--dsw-alias-label-secondary); transition:transform .16s ease, background .16s ease; }
      .qqb-switch-on .qqb-switch-track { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }
      .qqb-switch-on .qqb-switch-knob { transform:translateX(16px); background:#fff; }
      .qqb-switch-text { font-size:12px; color:var(--dsw-alias-label-secondary); white-space:nowrap; }
      .qqb-switch-on .qqb-switch-text { color:var(--dsw-alias-label-primary); }
      .qqb-switch-busy { opacity:.6; cursor:default; }
      .qqb-switch input:focus-visible + .qqb-switch-track { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
      .qqb-btn { appearance:none; border:1px solid transparent; border-radius:8px; padding:6px 12px; font:inherit; font-size:12px; cursor:pointer; background:var(--dsw-alias-brand-primary); color:#fff; white-space:nowrap; }
      .qqb-btn:disabled { opacity:.5; cursor:default; }
      .qqb-btn-ghost { background:transparent; border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); }
      .qqb-btn-danger { background:transparent; border-color:var(--dsw-alias-border-l1); color:var(--dsw-alias-state-error-primary); flex:none; }
      .qqb-columns { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
      .qqb-subhead { margin:2px 0 8px; font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary); }
      .qqb-list { display:flex; flex-direction:column; gap:8px; max-height:320px; overflow:auto; padding-right:2px; }
      .qqb-row { display:flex; align-items:flex-start; gap:10px; padding:10px 11px; border-radius:10px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); }
      .qqb-row-main { min-width:0; flex:1; display:flex; flex-direction:column; gap:4px; }
      .qqb-row-title { font-size:13px; font-weight:600; overflow-wrap:anywhere; }
      .qqb-muted { color:var(--dsw-alias-label-secondary); font-weight:400; font-size:11px; }
      .qqb-row-text { font-size:12px; line-height:1.55; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
      .qqb-row-note { font-size:12px; line-height:1.5; color:var(--dsw-alias-state-warn-primary); }
      .qqb-row-meta { font-size:11px; color:var(--dsw-alias-label-secondary); opacity:.8; }
      .qqb-row-feedback { font-size:12px; line-height:1.55; padding:6px 9px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); overflow-wrap:anywhere; }
      .qqb-row-feedback-busy { color:var(--dsw-alias-label-secondary); }
      .qqb-row-feedback-error { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }
      .qqb-row-feedback-ok { color:var(--dsw-alias-state-success-primary); }
      .qqb-row-has-error { border-color:var(--dsw-alias-state-error-primary); }
      @media (max-width:640px) { .qqb-actions { flex-wrap:wrap; } }
      .qqb-tag { display:inline-block; margin-left:6px; padding:0 5px; border-radius:4px; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); font-size:10px; font-weight:400; color:var(--dsw-alias-label-secondary); }
      .qqb-memory-editor { display:flex; flex-direction:column; gap:7px; margin-top:8px; padding-top:8px; border-top:1px solid var(--dsw-alias-border-l1); }
      .qqb-memory-editor .qqb-field { display:flex; flex-direction:column; gap:3px; }
      .qqb-memory-editor .qqb-field-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
      .qqb-empty { padding:14px; border:1px dashed var(--dsw-alias-border-l2); border-radius:10px; color:var(--dsw-alias-label-secondary); font-size:12px; }
      .qqb-count { font-size:11px; color:var(--dsw-alias-label-secondary); flex:none; }
      .qqb-details { border-top:1px solid var(--dsw-alias-border-l1); padding-top:8px; }
      .qqb-details summary { cursor:pointer; font-size:12px; color:var(--dsw-alias-label-secondary); }
      .qqb-pre { white-space:pre-wrap; overflow-wrap:anywhere; margin:8px 0 0; padding:10px; border-radius:8px; background:var(--dsw-alias-bg-layer-2); font:inherit; font-size:12px; line-height:1.6; color:var(--dsw-alias-label-secondary); }
      .qqb-diary-preview { max-height:320px; overflow:auto; }
      .qqb-stickers { gap:12px; }
      .qqb-sticker-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; max-height:520px; overflow:auto; }
      .qqb-sticker-card { display:flex; flex-direction:column; gap:6px; padding:8px; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-2); }
      .qqb-sticker-actions { display:flex; gap:6px; }
      .qqb-sticker-actions .qqb-btn { flex:1; min-width:0; padding:6px 8px; font-size:12px; }
      .qqb-sticker-manager { width:min(1100px,96vw); }
      .qqb-sticker-manager-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
      .qqb-sticker-manager-toolbar .qqb-input { flex:1; min-width:200px; }
      .qqb-sticker-manager-summary { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; color:var(--dsw-alias-label-secondary); }
      .qqb-sticker-manager-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; max-height:60vh; overflow:auto; padding:2px; }
      .qqb-sticker-select { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--dsw-alias-label-secondary); }
      .qqb-sticker-selected { outline:2px solid var(--dsw-alias-brand-primary); }
      .qqb-modal-backdrop { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(0,0,0,.45); }
      .qqb-modal { width:min(960px,96vw); max-height:88vh; overflow:auto; display:flex; flex-direction:column; gap:10px; padding:16px; border:1px solid var(--dsw-alias-border-l1); border-radius:14px; background:var(--dsw-alias-bg-layer-1); box-shadow:0 20px 60px rgba(0,0,0,.35); }
      .qqb-memory-modal { width:min(860px,96vw); }
      .qqb-memory-page-list { display:flex; flex-direction:column; gap:8px; max-height:60vh; overflow:auto; padding-right:2px; }
      .qqb-memory-search { display:flex; gap:8px; }
      .qqb-memory-more { margin-top:8px; align-self:flex-start; }
      .qqb-sticker-img { width:100%; height:110px; object-fit:contain; background:var(--dsw-alias-bg-layer-1); border-radius:6px; }
      .qqb-sticker-id { font-size:10px; color:var(--dsw-alias-label-secondary); font-family:ui-monospace,Consolas,monospace; overflow-wrap:anywhere; }
      .qqb-send { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .qqb-input { box-sizing:border-box; height:32px; padding:0 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; outline:none; width:130px; }
      .qqb-input:focus { border-color:var(--dsw-alias-brand-primary); }
      .qqb-select { width:90px; }
      .qqb-input-grow { flex:1; min-width:180px; }
    `;

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'qq-bot',
          order: 40,
          label: () => 'QQ 聊天',
        }, QQPage));
      },
    };
  },
});
