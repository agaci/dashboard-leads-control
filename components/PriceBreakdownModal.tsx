'use client';

import { useState } from 'react';
import type { PriceBreakdown } from '@/types/pricing';

export interface PriceBreakdownModalProps {
  breakdown?: PriceBreakdown;
  isOpen?: boolean;
  onClose?: () => void;
}

function formatPrice(value: number | undefined): string {
  if (value === undefined) return '—';
  return `€${value.toFixed(2)}`;
}

export function PriceBreakdownModal({ breakdown, isOpen = false, onClose }: PriceBreakdownModalProps) {
  if (!breakdown || !isOpen) return null;

  const isDirectService = breakdown.serviceType === 'direto';
  const isPartnerService = breakdown.serviceType === '24H';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--yb-bg)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 600,
          maxHeight: '80vh',
          overflowY: 'auto',
          color: 'var(--yb-fg)',
        }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Detalhamento de Preço</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: 'var(--yb-muted)',
              padding: 0,
            }}>
            ×
          </button>
        </div>

        {/* Timestamp */}
        <p style={{ fontSize: 11, color: 'var(--yb-subtle)', marginBottom: 16 }}>
          {breakdown.timestamp ? new Date(breakdown.timestamp).toLocaleString('pt-PT') : '—'}
        </p>

        {/* Serviço Direto */}
        {isDirectService && breakdown.directService && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--yb-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
              Serviço Direto (YourBox)
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Distância</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{breakdown.directService.distanceKm.toFixed(1)} km</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Tipo / Precedência</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    type{breakdown.directService.type} / precedence{breakdown.directService.precedence}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Preço Base</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatPrice(breakdown.directService.basePrice)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Markup</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{(breakdown.directService.percentPlusMax * 100).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Com Markup</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatPrice(breakdown.directService.priceWithMarkup)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Serviço Parceiro (24H) */}
        {isPartnerService && breakdown.partner && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--yb-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
              Parceiro Logístico
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Transportadora</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{breakdown.partner.name}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Peso</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{breakdown.partner.weightKg} kg</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Preço Base</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatPrice(breakdown.partner.basePrice)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Combustível ({breakdown.partner.fuelPercent}%)</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatPrice(breakdown.partner.fuelCharge)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Markup</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{(breakdown.partner.markup * 100).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Antes de IVA</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatPrice(breakdown.partner.priceBeforeIVA)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Depot */}
        {breakdown.depot && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--yb-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
              Recolha até Depósito
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Depósito</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{breakdown.depot.name}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Distância</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{breakdown.depot.distanceKm.toFixed(1)} km</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Tipo / Precedência</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    type{breakdown.depot.type} / precedence{breakdown.depot.precedence}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Preço Base</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatPrice(breakdown.depot.basePrice)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Final */}
        <div
          style={{
            background: 'var(--yb-card-2)',
            borderRadius: 8,
            padding: 12,
            marginTop: 20,
          }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--yb-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
            Total
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>Subtotal (antes IVA)</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>
                  {formatPrice(breakdown.final.subtotalBeforeIVA)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', color: 'var(--yb-muted)' }}>IVA ({((breakdown.final.ivaRate - 1) * 100).toFixed(0)}%)</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>
                  {formatPrice(breakdown.final.finalPrice - breakdown.final.subtotalBeforeIVA)}
                </td>
              </tr>
              <tr style={{ borderTop: '2px solid rgba(255,255,255,0.2)', marginTop: 8 }}>
                <td style={{ padding: '12px 0', color: 'hsl(var(--success))', fontWeight: 700 }}>Preço Final</td>
                <td style={{ padding: '12px 0', textAlign: 'right', color: 'hsl(var(--success))', fontWeight: 700, fontSize: 16 }}>
                  {formatPrice(breakdown.final.finalPrice)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Calculadora */}
        <p style={{ fontSize: 10, color: 'var(--yb-subtle)', marginTop: 16, marginBottom: 0 }}>
          Calculadora: {breakdown.calculator.name}
        </p>
      </div>
    </div>
  );
}
