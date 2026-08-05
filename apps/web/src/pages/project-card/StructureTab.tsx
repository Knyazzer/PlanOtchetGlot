import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatName } from '../../lib/utils'
import type { WorkItem, Department, WorkItemDetail, WorkItemStatus } from './types'
import { WI_STATUS_COLOR, WI_STATUS_LABEL, miniSelectStyle } from './constants'
import { fmtMoney } from './utils'
import { WIExpRow, LoadingState } from './ui'
import { WIFormModal } from './WIFormModal'
import { ExpensesBlock } from './FinanceTab'

// ── StructureTab ──────────────────────────────────────────────────────────────

export function StructureTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [selectedWIId, setSelectedWIId] = useState<string | null>(null)
  const [expandedWIId, setExpandedWIId] = useState<string | null>(null)
  const [selectedDivId, setSelectedDivId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'team' | 'scheduler' | 'freelancers' | 'expenses'>('team')
  const [wiCollapsed, setWiCollapsed] = useState(false)
  const [deptsCollapsed, setDeptsCollapsed] = useState(false)
  const [showWIForm, setShowWIForm] = useState(false)

  const { data: workItems = [], isLoading } = useQuery<WorkItem[]>({
    queryKey: ['work-items', projectId],
    queryFn:  () => api.get(`/projects/${projectId}/work-items`).then(r => r.data),
  })

  const { data: structure = [] } = useQuery<Department[]>({
    queryKey: ['structure'],
    queryFn: () => api.get('/structure').then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const activeWI = workItems.find(w => w.id === selectedWIId) ?? (workItems[0] ?? null)
  const activeWIId = activeWI?.id ?? null

  const { data: wiDetail } = useQuery<WorkItemDetail>({
    queryKey: ['wi-detail', activeWIId],
    queryFn: () => api.get(`/work-items/${activeWIId}`).then(r => r.data),
    enabled: !!activeWIId,
    staleTime: 30_000,
  })

  const updateWI = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/work-items/${activeWIId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      qc.invalidateQueries({ queryKey: ['wi-detail', activeWIId] })
    },
  })

  const deleteWI = useMutation({
    mutationFn: (id: string) => api.delete(`/work-items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      setSelectedWIId(null)
    },
  })

  const setDepartments = useMutation({
    mutationFn: (divisionIds: string[]) => api.put(`/work-items/${activeWIId}/departments`, { divisionIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-items', projectId] })
      qc.invalidateQueries({ queryKey: ['wi-detail', activeWIId] })
    },
  })

  // Divisions for the active WI, enriched with dept color
  const allDivisions = structure.flatMap(dept =>
    (dept.divisions ?? []).map(div => ({ ...div, deptName: dept.name, deptColor: dept.color }))
  )
  const wiDivisions = activeWI
    ? activeWI.departments.map(d => allDivisions.find(ad => ad.id === d.division.id)).filter(Boolean) as typeof allDivisions
    : []
  const activeDivision = wiDivisions.find(d => d.id === selectedDivId) ?? (wiDivisions[0] ?? null)

  // When WI changes, reset dept selection
  const handleSelectWI = (id: string) => {
    if (selectedWIId !== id) {
      setSelectedWIId(id)
      setSelectedDivId(null)
      setDetailTab('team')
    }
    setExpandedWIId(expandedWIId === id ? null : id)
  }

  // When dept changes, reset detail tab
  const handleSelectDiv = (id: string) => {
    setSelectedDivId(id)
    setDetailTab('team')
  }

  const collapseBtn = (collapsed: boolean, onToggle: () => void): React.CSSProperties => ({
    width: 24, height: 24, borderRadius: 5, flexShrink: 0,
    background: 'var(--surface-3)', border: '1px solid rgba(255,255,255,0.13)',
    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.12s', transform: collapsed ? 'rotate(180deg)' : 'none',
    fontFamily: 'monospace',
  })

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  if (isLoading) return <LoadingState />

  // grid template columns
  const wiW = wiCollapsed ? 36 : 360
  const depW = deptsCollapsed ? 36 : 280
  const gridCols = `${wiW}px ${depW}px 1fr`

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: gridCols, overflow: 'hidden', transition: 'grid-template-columns 0.22s cubic-bezier(.4,0,.2,1)' }}>

      {/* ── Col 1: WI папки ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRight: '1px solid var(--border)', overflow: 'hidden', minWidth: 0 }}>
        {/* header */}
        <div style={{ padding: wiCollapsed ? 0 : '0 12px', height: 40, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', flexShrink: 0, justifyContent: wiCollapsed ? 'center' : 'flex-start' }}>
          {!wiCollapsed && <>
            <span style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', flex: 1 }}>Work Items</span>
            <button onClick={() => setShowWIForm(true)} style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', padding: '3px 8px', fontFamily: 'Inter, sans-serif', borderRadius: 5, transition: 'color 0.1s' }}>+ Добавить</button>
          </>}
          <button
            onClick={() => setWiCollapsed(c => !c)}
            style={collapseBtn(wiCollapsed, () => {})}
            title={wiCollapsed ? 'Развернуть' : 'Свернуть'}
          >‹</button>
        </div>

        {/* collapsed strip */}
        {wiCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 5 }}>
            {workItems.map((wi, i) => (
              <div
                key={wi.id}
                onClick={() => { setWiCollapsed(false); handleSelectWI(wi.id) }}
                title={wi.title}
                style={{
                  width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  background: wi.id === activeWIId ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.08)',
                  color: wi.id === activeWIId ? '#F59E0B' : 'rgba(245,158,11,0.6)',
                  border: `1px solid ${wi.id === activeWIId ? 'rgba(245,158,11,0.7)' : 'rgba(245,158,11,0.15)'}`,
                }}
              >{String(i + 1).padStart(2, '0')}</div>
            ))}
          </div>
        )}

        {/* WI scroll */}
        {!wiCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px 60px', direction: 'rtl' }}>
            {workItems.length === 0 && (
              <div style={{ direction: 'ltr', padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Нет work items</div>
            )}
            {workItems.map((wi, idx) => {
              const isActive = wi.id === activeWIId
              const isExpanded = expandedWIId === wi.id || isActive
              return (
                <div
                  key={wi.id}
                  onClick={() => handleSelectWI(wi.id)}
                  style={{
                    direction: 'ltr', position: 'relative', paddingTop: 10, cursor: 'pointer',
                    width: isActive ? '100%' : '82%', alignSelf: 'flex-end',
                    transition: 'width 0.18s cubic-bezier(.4,0,.2,1)',
                  }}
                >
                  {/* tab ear */}
                  <div style={{ position: 'absolute', top: 0, left: 0, height: 10, width: 90, borderRadius: '6px 8px 0 0', background: 'rgba(245,158,11,0.55)' }} />
                  {/* card body */}
                  <div style={{
                    borderRadius: '0 8px 8px 8px',
                    border: `1.5px solid ${isActive ? 'rgba(245,158,11,0.55)' : 'rgba(245,158,11,0.28)'}`,
                    background: 'rgba(245,158,11,0.08)',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s',
                  }}>
                    {/* amber strip */}
                    <div style={{ height: 3, background: 'linear-gradient(90deg,#F59E0B,#FCD34D)' }} />
                    {/* head */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 400, fontFamily: 'monospace', color: 'rgba(245,158,11,0.85)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.22)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{wi.title}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, background: `${WI_STATUS_COLOR[wi.status]}18`, color: WI_STATUS_COLOR[wi.status] }}>
                        {WI_STATUS_LABEL[wi.status]}
                      </span>
                    </div>
                    {/* expanded content */}
                    {isExpanded && (
                      <div onClick={e => e.stopPropagation()} style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(245,158,11,0.12)', marginTop: 2 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
                          {wi.date && <WIExpRow label="Дата" value={wi.date} />}
                          {wi.location && <WIExpRow label="Локация" value={wi.location} />}
                          {wi.format && <WIExpRow label="Формат" value={wi.format} />}
                          {wi.execProducer && <WIExpRow label="Исп. продюсер" value={formatName(wi.execProducer.name)} />}
                          {wi.lineProducer && <WIExpRow label="Лайн" value={formatName(wi.lineProducer.name)} />}
                          {wi.budget && <WIExpRow label="Бюджет" value={fmtMoney(wi.budget)} />}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <select value={wi.status} onChange={e => { e.stopPropagation(); updateWI.mutate({ status: e.target.value }) }} style={{ ...miniSelectStyle, fontSize: 12 }}
                              onClick={e => e.stopPropagation()}>
                              {(Object.entries(WI_STATUS_LABEL) as [WorkItemStatus, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => deleteWI.mutate(wi.id)} style={{ ...miniSelectStyle, cursor: 'pointer', color: '#E8194B', background: 'rgba(232,25,75,0.08)', borderColor: 'rgba(232,25,75,0.2)', fontFamily: 'Inter, sans-serif' }}>
                              Удалить
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Col 2: Отделы ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', borderRight: '1px solid var(--border)', overflow: 'hidden', minWidth: 0 }}>
        {/* header */}
        <div style={{ padding: deptsCollapsed ? 0 : '0 12px', height: 40, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', flexShrink: 0, justifyContent: deptsCollapsed ? 'center' : 'flex-start' }}>
          {!deptsCollapsed && (
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              {activeWI ? `Отделы · ${workItems.findIndex(w => w.id === activeWIId) + 1 > 0 ? `T${workItems.findIndex(w => w.id === activeWIId) + 1}` : '—'}` : 'Отделы'}
            </span>
          )}
          <button
            onClick={() => setDeptsCollapsed(c => !c)}
            style={collapseBtn(deptsCollapsed, () => {})}
            title={deptsCollapsed ? 'Развернуть' : 'Свернуть'}
          >‹</button>
        </div>

        {/* collapsed strip */}
        {deptsCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 5 }}>
            {wiDivisions.map(div => (
              <div
                key={div.id}
                onClick={() => { setDeptsCollapsed(false); handleSelectDiv(div.id) }}
                title={div.name}
                style={{
                  width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  background: div.id === activeDivision?.id ? `${div.deptColor}40` : `${div.deptColor}18`,
                  color: div.deptColor,
                  border: `1px solid ${div.id === activeDivision?.id ? div.deptColor : `${div.deptColor}40`}`,
                }}
              >{initials(div.name)}</div>
            ))}
          </div>
        )}

        {/* dept cards */}
        {!deptsCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {!activeWI ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>🏢</span>
                <span style={{ fontSize: 12 }}>Выберите Work Item</span>
              </div>
            ) : wiDivisions.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                <span style={{ fontSize: 28, opacity: 0.2 }}>🏢</span>
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>Нет отделов.<br/>Добавьте через редактор WI.</span>
              </div>
            ) : (
              wiDivisions.map(div => {
                const isActiveDept = div.id === activeDivision?.id
                return (
                  <div
                    key={div.id}
                    onClick={() => handleSelectDiv(div.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      background: isActiveDept ? 'rgba(255,107,53,0.06)' : 'var(--surface-2)',
                      border: `1px solid ${isActiveDept ? '#FF6B35' : 'rgba(255,255,255,0.13)'}`,
                      borderRadius: 9, padding: '8px 11px', cursor: 'pointer',
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12.5, fontWeight: 800, flexShrink: 0,
                      background: `${div.deptColor}20`, color: div.deptColor,
                    }}>{initials(div.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{div.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 }}>{div.deptName}</div>
                    </div>
                  </div>
                )
              })
            )}
            {/* + Подключить отдел */}
            {activeWI && (
              <button
                onClick={() => {
                  // toggle all divisions selector inline — open WI form for now
                  setShowWIForm(true)
                }}
                style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.13)', borderRadius: 8, fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', padding: '7px 12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s', width: '100%', marginTop: 2 }}
              >+ Подключить отдел</button>
            )}
          </div>
        )}
      </div>

      {/* ── Col 3: Детали отдела ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-2)', overflow: 'hidden' }}>
        {/* crumbs bar */}
        <div style={{ height: 40, padding: '0 20px', flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {activeWI && activeDivision ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden' }}>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{activeWI.title}</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: '#FF6B35', fontWeight: 700, whiteSpace: 'nowrap' }}>{activeDivision.name}</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Выберите WI и отдел</span>
          )}
        </div>

        {!activeWI || !activeDivision ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
            <span style={{ fontSize: 36, opacity: 0.15 }}>🗂</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Выберите Work Item и отдел</span>
            <span style={{ fontSize: 12, maxWidth: 200, lineHeight: 1.5, color: 'var(--text-muted)', opacity: 0.7 }}>Нажмите на WI-карточку, затем на отдел чтобы увидеть детали</span>
          </div>
        ) : (
          <>
            {/* dept detail header */}
            <div style={{ padding: '14px 22px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                  background: `${activeDivision.deptColor}20`, color: activeDivision.deptColor,
                }}>{initials(activeDivision.name)}</div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{activeDivision.name}</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{activeDivision.deptName}</div>
                </div>
                <button
                  onClick={() => setShowWIForm(true)}
                  style={{ background: 'var(--surface-3)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 7, padding: '5px 12px', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
                >Изменить</button>
              </div>
              {/* detail tabs */}
              <div style={{ display: 'flex', marginBottom: -1 }}>
                {(['team', 'scheduler', 'freelancers', 'expenses'] as const).map(t => {
                  const labels = { team: 'Команда', scheduler: 'Планировщик', freelancers: 'Фрилы', expenses: 'Расходы' }
                  return (
                    <button
                      key={t}
                      onClick={() => setDetailTab(t)}
                      style={{
                        background: 'none', border: 'none', borderBottom: `2px solid ${detailTab === t ? '#FF6B35' : 'transparent'}`,
                        padding: '9px 14px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: detailTab === t ? 600 : 500,
                        color: detailTab === t ? '#FF6B35' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.12s', marginBottom: -1,
                      }}
                    >{labels[t]}</button>
                  )
                })}
              </div>
            </div>

            {/* detail body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              {detailTab === 'expenses' && wiDetail && (
                <ExpensesBlock wiId={activeWIId!} projectId={projectId} expenses={wiDetail.expenses} budget={activeWI.budget} />
              )}
              {detailTab === 'team' && (
                <div style={{ border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 12, background: 'var(--surface-2)', padding: '48px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>👥</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5 }}>Команда отдела</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 300, margin: '0 auto 12px' }}>Список штатных сотрудников и подрядчиков, подключённых к этому отделу: роли, тип занятости, количество смен, нагрузка.</div>
                  <span style={{ display: 'inline-block', padding: '3px 10px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 99, fontSize: 12.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>— ЗАГЛУШКА · В РАЗРАБОТКЕ —</span>
                </div>
              )}
              {detailTab === 'scheduler' && (
                <div style={{ border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 12, background: 'var(--surface-2)', padding: '48px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>📅</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5 }}>Планировщик</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 280, margin: '0 auto 12px' }}>График смен и нагрузки по отделу для этого Work Item.</div>
                  <span style={{ display: 'inline-block', padding: '3px 10px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 99, fontSize: 12.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>— ЗАГЛУШКА · В РАЗРАБОТКЕ —</span>
                </div>
              )}
              {detailTab === 'freelancers' && (
                <div style={{ border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 12, background: 'var(--surface-2)', padding: '48px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>🎭</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 5 }}>Фрилансеры</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 280, margin: '0 auto 12px' }}>Внешние подрядчики, привлечённые для этого отдела в рамках Work Item.</div>
                  <span style={{ display: 'inline-block', padding: '3px 10px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 99, fontSize: 12.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>— ЗАГЛУШКА · В РАЗРАБОТКЕ —</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showWIForm && <WIFormModal projectId={projectId} onClose={() => setShowWIForm(false)} />}
    </div>
  )
}
