import type { CSSProperties } from 'react';
import type { FlowTone } from '../types';

export const panelStyle: CSSProperties = {
  borderColor: 'var(--ff-border)',
  background: 'var(--ff-surface-solid)',
};

export const raisedPanelStyle: CSSProperties = {
  borderColor: 'var(--ff-border)',
  background: 'var(--ff-surface-raised)',
};

export const mutedPanelStyle: CSSProperties = {
  borderColor: 'var(--ff-border)',
  background: 'var(--ff-surface-muted)',
};

export const primarySoftStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--ff-primary) 12%, var(--ff-surface-solid))',
  border: '1px solid color-mix(in srgb, var(--ff-primary) 26%, var(--ff-border))',
  color: 'var(--ff-primary)',
};

export const subtleButtonStyle: CSSProperties = {
  background: 'var(--ff-surface-raised)',
  border: '1px solid var(--ff-border)',
  color: 'var(--ff-text-secondary)',
};

export const dangerButtonStyle: CSSProperties = {
  background: 'var(--ff-danger-bg)',
  border: '1px solid var(--ff-danger-border)',
  color: 'var(--ff-danger-text)',
};

export function getFlowToneStyle(tone: FlowTone): CSSProperties {
  if (tone === 'success') return { background: 'var(--ff-success-bg)', borderColor: 'var(--ff-success-border)', color: 'var(--ff-success-text)' };
  if (tone === 'danger') return { background: 'var(--ff-danger-bg)', borderColor: 'var(--ff-danger-border)', color: 'var(--ff-danger-text)' };
  if (tone === 'warning') return { background: 'var(--ff-warning-bg)', borderColor: 'var(--ff-warning-border)', color: 'var(--ff-warning-text)' };
  if (tone === 'info') return { background: 'var(--ff-info-bg)', borderColor: 'var(--ff-info-border)', color: 'var(--ff-info-text)' };
  if (tone === 'brand') return {
    background: 'color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))',
    borderColor: 'color-mix(in srgb, var(--ff-primary) 34%, var(--ff-border))',
    color: 'var(--ff-primary)',
  };
  return { background: 'var(--ff-surface-raised)', borderColor: 'var(--ff-border)', color: 'var(--ff-text-secondary)' };
}

export const flowPrimaryActionStyle: CSSProperties = {
  background: 'linear-gradient(135deg, #059669, #10b981)',
  color: '#ffffff',
  border: '1px solid rgba(16, 185, 129, 0.35)',
};

export const flowBrandActionStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))',
  color: 'var(--ff-primary)',
  border: '1px solid color-mix(in srgb, var(--ff-primary) 32%, var(--ff-border))',
};

export const flowDangerActionStyle: CSSProperties = {
  background: 'var(--ff-danger-bg)',
  color: 'var(--ff-danger-text)',
  border: '1px solid var(--ff-danger-border)',
};
