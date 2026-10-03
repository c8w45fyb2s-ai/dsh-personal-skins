import React from 'react';
import { createClientApi } from './api.js';
import { installRenderer } from './renderer.js';
import { mountEditor } from './editor.js';

export const inject = ['slots'];

function activePreset(profile) {
  return profile?.presets?.find((preset) => preset.id === profile.activePresetId) || null;
}

function createSettingsSection(openPanel) {
  return function SkinSettingsSection() {
    const trigger = React.useRef(null);
    return React.createElement('section', {
      className: 'dsh-personal-skins-launcher',
      style: { maxWidth: 720, margin: '0 auto', padding: '28px 24px', color: 'var(--dsw-alias-label-primary, CanvasText)' },
    },
    React.createElement('h2', { style: { margin: '0 0 8px', fontSize: 22 } }, '我的皮肤'),
    React.createElement('p', { style: { margin: '0 0 20px', color: 'var(--dsw-alias-label-secondary, GrayText)' } }, '在独立的大面板中管理预设、调整预览和保存更改。'),
    React.createElement('button', {
      ref: trigger,
      type: 'button',
      onClick: () => openPanel(trigger.current),
      style: { border: 0, borderRadius: 10, padding: '10px 18px', color: '#fff', background: '#d88f9e', cursor: 'pointer', font: 'inherit' },
    }, '打开皮肤工作区'));
  };
}

function createPanelOverlay(api, getUiTheme, bindOpenPanel) {
  return function SkinPanelOverlay() {
    const [open, setOpen] = React.useState(false);
    const mount = React.useRef(null);
    const returnFocus = React.useRef(null);
    const wasOpen = React.useRef(false);
    const openPanel = React.useCallback((trigger) => {
      returnFocus.current = trigger;
      setOpen(true);
    }, []);

    React.useEffect(() => {
      bindOpenPanel(openPanel);
      return () => bindOpenPanel(null);
    }, [openPanel]);

    React.useEffect(() => {
      if (!open) {
        if (!wasOpen.current) return undefined;
        wasOpen.current = false;
        const trigger = returnFocus.current;
        returnFocus.current = null;
        if (!trigger) return undefined;
        const visibleEnabled = (element) => {
          if (!element?.isConnected || element.disabled || element.getAttribute?.('aria-hidden') === 'true') return false;
          if (element.closest?.('.dsh-skin-workspace-host')) return false;
          if (!element.getClientRects?.().length) return false;
          const style = document.defaultView?.getComputedStyle?.(element);
          return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
        };
        if (visibleEnabled(trigger)) {
          trigger.focus();
          return undefined;
        }
        const chatInput = [...document.querySelectorAll('textarea,[contenteditable="true"]')].find(visibleEnabled);
        const fallback = chatInput || [...document.querySelectorAll('button:enabled,input:enabled,select:enabled,a[href],[tabindex]:not([tabindex="-1"])')]
          .find((element) => visibleEnabled(element) && !(Number.isFinite(element.tabIndex) && element.tabIndex < 0));
        fallback?.focus();
        return undefined;
      }

      wasOpen.current = true;
      const cleanup = mountEditor(mount.current, {
        api,
        getUiTheme,
        standalone: true,
        onClose: () => setOpen(false),
      });
      const dialog = mount.current?.firstElementChild;
      const focusScope = () => dialog?.querySelector('[role="alertdialog"]') || dialog;
      const focusable = () => [...(focusScope()?.querySelectorAll('button:not(:disabled),input:not(:disabled):not([hidden]):not([tabindex="-1"]),select:not(:disabled),[tabindex]:not([tabindex="-1"])') || [])];
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cleanup.requestClose?.();
          return;
        }
        if (event.key !== 'Tab' || !dialog) return;
        const items = focusable();
        if (!items.length) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const scope = focusScope();
        if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKeyDown, true);
      requestAnimationFrame(() => dialog?.querySelector('.dsh-skin-workspace-close')?.focus());
      return () => {
        document.removeEventListener('keydown', onKeyDown, true);
        cleanup();
      };
    }, [open, api]);

    return open ? React.createElement('div', { ref: mount, className: 'dsh-skin-workspace-host' }) : null;
  };
}

/** Client entry called by DSH's Cordis client loader. */
export function apply(ctx) {
  let renderer;
  let openPanelHandler = null;
  let pendingPanelTrigger = null;
  const requestOpenPanel = (trigger) => {
    if (openPanelHandler) openPanelHandler(trigger);
    else pendingPanelTrigger = trigger;
  };
  const bindOpenPanel = (handler) => {
    openPanelHandler = handler;
    if (handler && pendingPanelTrigger) {
      const trigger = pendingPanelTrigger;
      pendingPanelTrigger = null;
      handler(trigger);
    }
  };
  const api = createClientApi({ onProfile: (profile) => renderer?.apply(activePreset(profile)) });
  renderer = installRenderer({ api });

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'personal-skins.editor',
    order: 90,
  }, createPanelOverlay(api, renderer.getUiTheme, bindOpenPanel)));

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'personal-skins',
    order: 90,
    label: '我的皮肤',
  }, createSettingsSection((trigger) => requestOpenPanel(trigger))));

  ctx.effect(() => () => {
    renderer?.dispose();
    api.dispose();
  }, 'dsh-personal-skins: renderer');
}
