/**
 * GeofencePanel — Admin panel for managing geographical restriction zones.
 *
 * Features:
 * - Google Maps with polygon drawing for zone creation
 * - List of existing zones with toggle/edit/delete
 * - Color-coded zones by restriction type
 * - GOD MODE override management (super_admin only)
 *
 * Design: Industrial Performance / Motorsport Dark (matches PPEI theme)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MapPin, Plus, Trash2, Eye, EyeOff, Edit3, Save, X,
  Shield, ShieldOff, AlertTriangle, Globe, Lock, Upload,
  Download, Ban, ChevronDown, ChevronUp, Crosshair,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { MapView } from '@/components/Map';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.14 0.006 260)',
  bgHover: 'oklch(0.18 0.008 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  purple: 'oklch(0.60 0.20 300)',
  orange: 'oklch(0.70 0.18 50)',
};

const RESTRICTION_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  block_upload: { label: 'BLOCK UPLOAD', icon: <Upload style={{ width: 12, height: 12 }} />, color: sColor.orange },
  block_download: { label: 'BLOCK DOWNLOAD', icon: <Download style={{ width: 12, height: 12 }} />, color: sColor.blue },
  block_both: { label: 'BLOCK ALL', icon: <Ban style={{ width: 12, height: 12 }} />, color: sColor.red },
};

const DEFAULT_COLORS = ['#FF0000', '#FF6600', '#FFCC00', '#00CC66', '#0066FF', '#9933FF', '#FF3399'];

type DrawingMode = 'idle' | 'drawing';

interface ZoneFormData {
  name: string;
  description: string;
  restrictionType: 'block_upload' | 'block_download' | 'block_both';
  color: string;
}

export default function GeofencePanel() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;

  // Map state
  const mapRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polygonsRef = useRef<Map<number, google.maps.Polygon>>(new Map());
  const activePolygonRef = useRef<google.maps.Polygon | null>(null);

  // UI state
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('idle');
  const [drawnCoords, setDrawnCoords] = useState<Array<{ lat: number; lng: number }>>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  const [formData, setFormData] = useState<ZoneFormData>({
    name: '', description: '', restrictionType: 'block_both', color: '#FF0000',
  });

  // Data
  const { data: zones, refetch: refetchZones } = trpc.geofence.listZones.useQuery(undefined, {
    enabled: isAdmin,
  });

  const createZone = trpc.geofence.createZone.useMutation({
    onSuccess: () => { toast.success('Geofence zone created'); refetchZones(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateZone = trpc.geofence.updateZone.useMutation({
    onSuccess: () => { toast.success('Zone updated'); refetchZones(); setEditingZoneId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteZone = trpc.geofence.deleteZone.useMutation({
    onSuccess: () => { toast.success('Zone deleted'); refetchZones(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = useCallback(() => {
    setShowCreateForm(false);
    setDrawingMode('idle');
    setDrawnCoords([]);
    setFormData({ name: '', description: '', restrictionType: 'block_both', color: '#FF0000' });
    if (activePolygonRef.current) {
      activePolygonRef.current.setMap(null);
      activePolygonRef.current = null;
    }
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setDrawingMode(null);
    }
  }, []);

  // Render existing zones on map
  const renderZonesOnMap = useCallback(() => {
    if (!mapRef.current || !zones) return;

    // Clear old polygons
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current.clear();

    zones.forEach((zone: any) => {
      if (!zone.isActive) return;
      const coords = Array.isArray(zone.polygon) ? zone.polygon : [];
      if (coords.length < 3) return;

      const polygon = new google.maps.Polygon({
        paths: coords,
        strokeColor: zone.color || '#FF0000',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: zone.color || '#FF0000',
        fillOpacity: 0.2,
        map: mapRef.current!,
        clickable: true,
      });

      // Info window on click
      polygon.addListener('click', (e: google.maps.MapMouseEvent) => {
        const restriction = RESTRICTION_LABELS[zone.restrictionType] || RESTRICTION_LABELS.block_both;
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;padding:4px"><strong>${zone.name}</strong><br/><span style="color:${restriction.color};font-size:12px">${restriction.label}</span>${zone.description ? `<br/><small>${zone.description}</small>` : ''}</div>`,
          position: e.latLng,
        });
        infoWindow.open(mapRef.current!);
      });

      polygonsRef.current.set(zone.id, polygon);
    });
  }, [zones]);

  useEffect(() => {
    renderZonesOnMap();
  }, [renderZonesOnMap]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;

    // Load drawing library
    const script = document.createElement('script');
    const forgeBase = import.meta.env.VITE_FRONTEND_FORGE_API_URL || 'https://forge.butterfly-effect.dev';
    const apiKey = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
    script.src = `${forgeBase}/v1/maps/proxy/maps/api/js?key=${apiKey}&libraries=drawing&callback=__geoDrawingReady`;
    script.async = true;

    (window as any).__geoDrawingReady = () => {
      // Drawing library loaded
      renderZonesOnMap();
    };

    // Check if drawing library already available
    if (google.maps.drawing) {
      renderZonesOnMap();
    } else {
      document.head.appendChild(script);
    }
  }, [renderZonesOnMap]);

  const startDrawing = useCallback(() => {
    if (!mapRef.current) return;
    setDrawingMode('drawing');
    setShowCreateForm(false);

    // Clean up previous
    if (activePolygonRef.current) {
      activePolygonRef.current.setMap(null);
      activePolygonRef.current = null;
    }

    if (google.maps.drawing) {
      if (!drawingManagerRef.current) {
        drawingManagerRef.current = new google.maps.drawing.DrawingManager({
          drawingMode: google.maps.drawing.OverlayType.POLYGON,
          drawingControl: false,
          polygonOptions: {
            fillColor: formData.color,
            fillOpacity: 0.3,
            strokeColor: formData.color,
            strokeWeight: 2,
            editable: true,
            draggable: true,
          },
        });
        drawingManagerRef.current.setMap(mapRef.current);

        google.maps.event.addListener(drawingManagerRef.current, 'polygoncomplete', (polygon: google.maps.Polygon) => {
          activePolygonRef.current = polygon;
          drawingManagerRef.current?.setDrawingMode(null);

          const path = polygon.getPath();
          const coords: Array<{ lat: number; lng: number }> = [];
          for (let i = 0; i < path.getLength(); i++) {
            const pt = path.getAt(i);
            coords.push({ lat: pt.lat(), lng: pt.lng() });
          }
          setDrawnCoords(coords);
          setDrawingMode('idle');
          setShowCreateForm(true);
        });
      } else {
        drawingManagerRef.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
        drawingManagerRef.current.setMap(mapRef.current);
      }
    } else {
      toast.error('Drawing library not loaded yet. Please try again.');
      setDrawingMode('idle');
    }
  }, [formData.color]);

  const handleCreate = () => {
    if (!formData.name.trim()) { toast.error('Zone name is required'); return; }
    if (drawnCoords.length < 3) { toast.error('Draw a polygon on the map first'); return; }
    createZone.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      restrictionType: formData.restrictionType,
      color: formData.color,
      polygon: drawnCoords,
    });
  };

  const handleToggleActive = (zoneId: number, currentActive: boolean) => {
    updateZone.mutate({ zoneId, isActive: !currentActive });
  };

  const handleDelete = (zoneId: number, zoneName: string) => {
    if (confirm(`Delete zone "${zoneName}"? This cannot be undone.`)) {
      deleteZone.mutate({ zoneId });
    }
  };

  const focusZone = (zone: any) => {
    if (!mapRef.current) return;
    const coords = Array.isArray(zone.polygon) ? zone.polygon : [];
    if (coords.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    coords.forEach((c: any) => bounds.extend({ lat: c.lat, lng: c.lng }));
    mapRef.current.fitBounds(bounds, 50);
  };

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', flexDirection: 'column', gap: '12px' }}>
        <Lock style={{ width: 48, height: 48, color: sColor.red }} />
        <p style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: sColor.text, letterSpacing: '0.1em' }}>ADMIN ACCESS REQUIRED</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
        borderLeft: `3px solid ${sColor.red}`,
      }}>
        <div>
          <h2 style={{
            fontFamily: sFont.heading, fontSize: '1.2rem', color: sColor.text,
            letterSpacing: '0.1em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Globe style={{ width: 20, height: 20, color: sColor.red }} />
            GEOFENCE ZONE MANAGER
          </h2>
          <p style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textMuted, margin: '4px 0 0' }}>
            {zones?.length ?? 0} ZONES DEFINED · {zones?.filter((z: any) => z.isActive).length ?? 0} ACTIVE
            {isSuperAdmin && <span style={{ color: sColor.yellow, marginLeft: '8px' }}>◆ GOD MODE</span>}
          </p>
        </div>
        <Button
          onClick={drawingMode === 'drawing' ? resetForm : startDrawing}
          style={{
            background: drawingMode === 'drawing' ? sColor.red : `${sColor.red}20`,
            border: `1px solid ${sColor.red}`,
            color: drawingMode === 'drawing' ? 'white' : sColor.red,
            fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          {drawingMode === 'drawing' ? (
            <><X style={{ width: 14, height: 14 }} /> CANCEL</>
          ) : (
            <><Plus style={{ width: 14, height: 14 }} /> NEW ZONE</>
          )}
        </Button>
      </div>

      {/* Drawing instruction banner */}
      {drawingMode === 'drawing' && (
        <div style={{
          padding: '10px 16px', background: `${sColor.yellow}15`, border: `1px solid ${sColor.yellow}40`,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <AlertTriangle style={{ width: 16, height: 16, color: sColor.yellow }} />
          <span style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.yellow }}>
            Click on the map to draw polygon points. Double-click or click the first point to close the shape.
          </span>
        </div>
      )}

      {/* Map */}
      <div style={{
        border: `1px solid ${sColor.border}`, overflow: 'hidden',
        position: 'relative',
      }}>
        <MapView
          className="w-full"
          initialCenter={{ lat: 30.22, lng: -92.02 }} // Lafayette, LA (PPEI HQ area)
          initialZoom={5}
          onMapReady={handleMapReady}
        />
        {/* Map overlay legend */}
        <div style={{
          position: 'absolute', bottom: '10px', left: '10px',
          background: 'rgba(10,10,10,0.85)', padding: '8px 12px',
          border: `1px solid ${sColor.border}`, zIndex: 10,
        }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted, marginBottom: '4px' }}>RESTRICTION TYPES</div>
          {Object.entries(RESTRICTION_LABELS).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <div style={{ width: '10px', height: '10px', background: val.color, opacity: 0.7 }} />
              <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim }}>{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Create form (shown after drawing) */}
      {showCreateForm && drawnCoords.length >= 3 && (
        <div style={{
          padding: '16px 20px', background: sColor.bgCard, border: `1px solid ${sColor.green}40`,
          borderLeft: `3px solid ${sColor.green}`,
        }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '0.95rem', color: sColor.green, letterSpacing: '0.08em', margin: '0 0 12px' }}>
            CREATE NEW ZONE ({drawnCoords.length} POINTS)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Name */}
            <div>
              <label style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, display: 'block', marginBottom: '4px' }}>ZONE NAME *</label>
              <input
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., SEMA Restricted Area"
                style={{
                  width: '100%', padding: '8px 10px', background: sColor.bg,
                  border: `1px solid ${sColor.border}`, color: sColor.text,
                  fontFamily: sFont.body, fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            {/* Restriction type */}
            <div>
              <label style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, display: 'block', marginBottom: '4px' }}>RESTRICTION TYPE</label>
              <select
                value={formData.restrictionType}
                onChange={e => setFormData(f => ({ ...f, restrictionType: e.target.value as any }))}
                style={{
                  width: '100%', padding: '8px 10px', background: sColor.bg,
                  border: `1px solid ${sColor.border}`, color: sColor.text,
                  fontFamily: sFont.body, fontSize: '0.8rem', outline: 'none',
                }}
              >
                <option value="block_both">Block Upload & Download</option>
                <option value="block_upload">Block Upload Only</option>
                <option value="block_download">Block Download Only</option>
              </select>
            </div>
            {/* Description */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, display: 'block', marginBottom: '4px' }}>DESCRIPTION (OPTIONAL)</label>
              <input
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Reason for this restriction zone..."
                style={{
                  width: '100%', padding: '8px 10px', background: sColor.bg,
                  border: `1px solid ${sColor.border}`, color: sColor.text,
                  fontFamily: sFont.body, fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            {/* Color picker */}
            <div>
              <label style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, display: 'block', marginBottom: '4px' }}>ZONE COLOR</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setFormData(f => ({ ...f, color: c }))}
                    style={{
                      width: '24px', height: '24px', background: c,
                      border: formData.color === c ? '2px solid white' : '1px solid transparent',
                      cursor: 'pointer', opacity: formData.color === c ? 1 : 0.6,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
            <Button onClick={resetForm} variant="outline" style={{
              fontFamily: sFont.heading, fontSize: '0.75rem', letterSpacing: '0.06em',
              color: sColor.textDim, borderColor: sColor.border,
            }}>
              CANCEL
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createZone.isPending || !formData.name.trim()}
              style={{
                background: sColor.green, color: '#000',
                fontFamily: sFont.heading, fontSize: '0.75rem', letterSpacing: '0.06em',
              }}
            >
              {createZone.isPending ? 'CREATING...' : 'CREATE ZONE'}
            </Button>
          </div>
        </div>
      )}

      {/* Zone list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{
          padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.text, letterSpacing: '0.08em' }}>
            ACTIVE ZONES
          </span>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted }}>
            {zones?.length ?? 0} TOTAL
          </span>
        </div>

        {!zones?.length ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px', background: sColor.bgCard,
            border: `1px solid ${sColor.border}`,
          }}>
            <MapPin style={{ width: 32, height: 32, color: sColor.textMuted, margin: '0 auto 12px' }} />
            <p style={{ fontFamily: sFont.heading, fontSize: '1rem', color: sColor.textDim, letterSpacing: '0.08em' }}>
              NO GEOFENCE ZONES DEFINED
            </p>
            <p style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textMuted, maxWidth: '400px', margin: '8px auto 0' }}>
              Click "NEW ZONE" to draw a polygon on the map and create a restriction area for tune uploads/downloads.
            </p>
          </div>
        ) : (
          zones.map((zone: any) => {
            const restriction = RESTRICTION_LABELS[zone.restrictionType] || RESTRICTION_LABELS.block_both;
            const isExpanded = expandedZone === zone.id;
            const coords = Array.isArray(zone.polygon) ? zone.polygon : [];

            return (
              <div key={zone.id} style={{
                background: sColor.bgCard,
                border: `1px solid ${zone.isActive ? `${zone.color || sColor.red}40` : sColor.border}`,
                borderLeft: `3px solid ${zone.isActive ? (zone.color || sColor.red) : sColor.textMuted}`,
                opacity: zone.isActive ? 1 : 0.6,
              }}>
                {/* Zone row */}
                <div
                  onClick={() => setExpandedZone(isExpanded ? null : zone.id)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '10px 14px',
                    cursor: 'pointer', gap: '10px',
                  }}
                >
                  {/* Color indicator */}
                  <div style={{
                    width: '12px', height: '12px', borderRadius: '2px',
                    background: zone.color || '#FF0000', flexShrink: 0,
                    opacity: zone.isActive ? 1 : 0.4,
                  }} />

                  {/* Name & info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.text,
                      fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {zone.name}
                    </div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
                      {coords.length} POINTS · {zone.isActive ? 'ACTIVE' : 'DISABLED'}
                    </div>
                  </div>

                  {/* Restriction badge */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', background: `${restriction.color}15`,
                    border: `1px solid ${restriction.color}40`,
                    color: restriction.color, fontFamily: sFont.mono, fontSize: '0.55rem',
                    letterSpacing: '0.04em', flexShrink: 0,
                  }}>
                    {restriction.icon} {restriction.label}
                  </span>

                  {/* Quick actions */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => focusZone(zone)}
                      title="Focus on map"
                      style={{
                        background: 'transparent', border: `1px solid ${sColor.border}`,
                        padding: '4px', cursor: 'pointer', color: sColor.textDim,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Crosshair style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(zone.id, zone.isActive)}
                      title={zone.isActive ? 'Disable zone' : 'Enable zone'}
                      style={{
                        background: 'transparent', border: `1px solid ${sColor.border}`,
                        padding: '4px', cursor: 'pointer',
                        color: zone.isActive ? sColor.green : sColor.textMuted,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {zone.isActive ? <Eye style={{ width: 14, height: 14 }} /> : <EyeOff style={{ width: 14, height: 14 }} />}
                    </button>
                    <button
                      onClick={() => handleDelete(zone.id, zone.name)}
                      title="Delete zone"
                      style={{
                        background: 'transparent', border: `1px solid ${sColor.border}`,
                        padding: '4px', cursor: 'pointer', color: sColor.red,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>

                  <div style={{ color: sColor.textMuted, flexShrink: 0 }}>
                    {isExpanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{
                    borderTop: `1px solid ${sColor.border}`, padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                  }}>
                    {zone.description && (
                      <p style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim, margin: 0 }}>
                        {zone.description}
                      </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <div style={{ padding: '8px', background: sColor.bg, border: `1px solid ${sColor.border}` }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted }}>CENTER</div>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.text }}>
                          {zone.centerLat ? `${Number(zone.centerLat).toFixed(4)}, ${Number(zone.centerLng).toFixed(4)}` : 'N/A'}
                        </div>
                      </div>
                      <div style={{ padding: '8px', background: sColor.bg, border: `1px solid ${sColor.border}` }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted }}>CREATED</div>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.text }}>
                          {new Date(zone.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ padding: '8px', background: sColor.bg, border: `1px solid ${sColor.border}` }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted }}>VERTICES</div>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.text }}>
                          {coords.length}
                        </div>
                      </div>
                    </div>
                    {/* Coordinate list */}
                    <details style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
                      <summary style={{ cursor: 'pointer', padding: '4px 0' }}>VIEW COORDINATES</summary>
                      <div style={{
                        maxHeight: '120px', overflow: 'auto', padding: '8px',
                        background: sColor.bg, border: `1px solid ${sColor.border}`, marginTop: '4px',
                      }}>
                        {coords.map((c: any, i: number) => (
                          <div key={i} style={{ padding: '2px 0' }}>
                            [{i}] {c.lat.toFixed(6)}, {c.lng.toFixed(6)}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* GOD MODE Override Section (super_admin only) */}
      {isSuperAdmin && (
        <div style={{
          padding: '16px 20px', background: sColor.bgCard,
          border: `1px solid ${sColor.yellow}30`, borderLeft: `3px solid ${sColor.yellow}`,
          marginTop: '8px',
        }}>
          <h3 style={{
            fontFamily: sFont.heading, fontSize: '0.95rem', color: sColor.yellow,
            letterSpacing: '0.08em', margin: '0 0 8px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Shield style={{ width: 16, height: 16 }} />
            GOD MODE — USER OVERRIDES
          </h3>
          <p style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, margin: '0 0 12px' }}>
            Exempt specific users from geofence restrictions or enforce additional restrictions.
            Only super_admin (Kory Willis) can manage overrides.
          </p>
          <GodModeOverrides />
        </div>
      )}
    </div>
  );
}

// ── GOD MODE Overrides Sub-component ──────────────────────────────────────

function GodModeOverrides() {
  const { data: overrides, refetch } = trpc.geofence.listOverrides.useQuery();
  const createOverride = trpc.geofence.createOverride.useMutation({
    onSuccess: () => { toast.success('Override created'); refetch(); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteOverride = trpc.geofence.deleteOverride.useMutation({
    onSuccess: () => { toast.success('Override removed'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [overrideType, setOverrideType] = useState<'exempt' | 'enforce'>('exempt');
  const [reason, setReason] = useState('');

  return (
    <div>
      {overrides && overrides.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
          {overrides.map((o: any) => (
            <div key={o.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
              background: sColor.bg, border: `1px solid ${sColor.border}`,
            }}>
              <span style={{
                padding: '2px 6px', fontFamily: sFont.mono, fontSize: '0.55rem',
                background: o.overrideType === 'exempt' ? `${sColor.green}20` : `${sColor.red}20`,
                color: o.overrideType === 'exempt' ? sColor.green : sColor.red,
                border: `1px solid ${o.overrideType === 'exempt' ? sColor.green : sColor.red}40`,
              }}>
                {o.overrideType === 'exempt' ? <ShieldOff style={{ width: 10, height: 10, display: 'inline' }} /> : <Shield style={{ width: 10, height: 10, display: 'inline' }} />}
                {' '}{o.overrideType.toUpperCase()}
              </span>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.text }}>
                User #{o.userId}
              </span>
              {o.zoneId && (
                <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
                  Zone #{o.zoneId}
                </span>
              )}
              {o.reason && (
                <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, flex: 1 }}>
                  — {o.reason}
                </span>
              )}
              <button
                onClick={() => deleteOverride.mutate({ overrideId: o.id })}
                style={{
                  background: 'transparent', border: `1px solid ${sColor.border}`,
                  padding: '3px', cursor: 'pointer', color: sColor.red,
                  display: 'flex', alignItems: 'center', marginLeft: 'auto',
                }}
              >
                <Trash2 style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, marginBottom: '12px' }}>
          No user overrides configured.
        </p>
      )}

      {showForm ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, display: 'block', marginBottom: '2px' }}>USER ID</label>
            <input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="e.g., 42"
              style={{
                width: '80px', padding: '6px 8px', background: sColor.bg,
                border: `1px solid ${sColor.border}`, color: sColor.text,
                fontFamily: sFont.mono, fontSize: '0.7rem', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, display: 'block', marginBottom: '2px' }}>TYPE</label>
            <select
              value={overrideType}
              onChange={e => setOverrideType(e.target.value as any)}
              style={{
                padding: '6px 8px', background: sColor.bg,
                border: `1px solid ${sColor.border}`, color: sColor.text,
                fontFamily: sFont.mono, fontSize: '0.7rem', outline: 'none',
              }}
            >
              <option value="exempt">EXEMPT</option>
              <option value="enforce">ENFORCE</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, display: 'block', marginBottom: '2px' }}>REASON</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason for override..."
              style={{
                width: '100%', padding: '6px 8px', background: sColor.bg,
                border: `1px solid ${sColor.border}`, color: sColor.text,
                fontFamily: sFont.body, fontSize: '0.7rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <Button
            onClick={() => {
              if (!userId) { toast.error('User ID required'); return; }
              createOverride.mutate({
                userId: parseInt(userId),
                overrideType,
                reason: reason || undefined,
              });
            }}
            disabled={createOverride.isPending}
            style={{
              background: sColor.yellow, color: '#000',
              fontFamily: sFont.heading, fontSize: '0.7rem', letterSpacing: '0.06em',
              padding: '6px 12px',
            }}
          >
            ADD
          </Button>
          <Button onClick={() => setShowForm(false)} variant="outline" style={{
            fontFamily: sFont.heading, fontSize: '0.7rem', padding: '6px 12px',
            color: sColor.textDim, borderColor: sColor.border,
          }}>
            CANCEL
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => setShowForm(true)}
          variant="outline"
          style={{
            fontFamily: sFont.heading, fontSize: '0.7rem', letterSpacing: '0.06em',
            color: sColor.yellow, borderColor: `${sColor.yellow}40`,
            display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          <Plus style={{ width: 12, height: 12 }} /> ADD USER OVERRIDE
        </Button>
      )}
    </div>
  );
}
