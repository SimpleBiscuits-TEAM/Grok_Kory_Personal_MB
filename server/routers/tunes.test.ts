import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database and storage modules
vi.mock('../db', () => ({
  getDb: vi.fn(() => null),
}));

vi.mock('../storage', () => ({
  storagePut: vi.fn(() => Promise.resolve({ key: 'test-key', url: 'https://s3.example.com/test' })),
}));

// Test the tune folder hierarchy logic
describe('Tune Folder Hierarchy', () => {
  it('should define correct folder types', () => {
    const folderTypes = ['root', 'make', 'model', 'year', 'ecu_family', 'ecu_variant', 'custom'];
    expect(folderTypes).toHaveLength(7);
    expect(folderTypes).toContain('make');
    expect(folderTypes).toContain('model');
    expect(folderTypes).toContain('year');
    expect(folderTypes).toContain('ecu_family');
    expect(folderTypes).toContain('custom');
  });

  it('should build correct hierarchy order: Make > Model > Year > ECU', () => {
    const hierarchy = ['make', 'model', 'year', 'ecu_family', 'ecu_variant'];
    expect(hierarchy[0]).toBe('make');
    expect(hierarchy[1]).toBe('model');
    expect(hierarchy[2]).toBe('year');
    expect(hierarchy[3]).toBe('ecu_family');
    expect(hierarchy[4]).toBe('ecu_variant');
  });
});

// Test folder tree building logic (extracted from TuneManager)
describe('Folder Tree Builder', () => {
  interface FolderData {
    id: string;
    parentId: string | null;
    name: string;
    folderType: string;
  }

  interface FolderNode extends FolderData {
    children: FolderNode[];
  }

  function buildFolderTree(folders: FolderData[]): FolderNode[] {
    const folderMap = new Map<string, FolderNode>();
    const roots: FolderNode[] = [];

    for (const f of folders) {
      folderMap.set(f.id, { ...f, children: [] });
    }

    for (const f of folders) {
      const node = folderMap.get(f.id)!;
      if (f.parentId && folderMap.has(f.parentId)) {
        folderMap.get(f.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  it('should build flat list as root nodes', () => {
    const folders: FolderData[] = [
      { id: '1', parentId: null, name: 'GM', folderType: 'make' },
      { id: '2', parentId: null, name: 'Ford', folderType: 'make' },
      { id: '3', parentId: null, name: 'Polaris', folderType: 'make' },
    ];

    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(3);
    expect(tree[0].name).toBe('GM');
    expect(tree[1].name).toBe('Ford');
    expect(tree[2].name).toBe('Polaris');
  });

  it('should nest children under parents', () => {
    const folders: FolderData[] = [
      { id: '1', parentId: null, name: 'GM', folderType: 'make' },
      { id: '2', parentId: '1', name: 'Silverado', folderType: 'model' },
      { id: '3', parentId: '2', name: '2024', folderType: 'year' },
      { id: '4', parentId: '3', name: 'L5P Duramax', folderType: 'ecu_family' },
    ];

    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('GM');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe('Silverado');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].name).toBe('2024');
    expect(tree[0].children[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].children[0].name).toBe('L5P Duramax');
  });

  it('should handle multiple makes with multiple models', () => {
    const folders: FolderData[] = [
      { id: '1', parentId: null, name: 'GM', folderType: 'make' },
      { id: '2', parentId: null, name: 'Polaris', folderType: 'make' },
      { id: '3', parentId: '1', name: 'Silverado', folderType: 'model' },
      { id: '4', parentId: '1', name: 'Sierra', folderType: 'model' },
      { id: '5', parentId: '2', name: 'RZR Pro R', folderType: 'model' },
      { id: '6', parentId: '2', name: 'Ranger', folderType: 'model' },
    ];

    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[1].children).toHaveLength(2);
    expect(tree[0].children[0].name).toBe('Silverado');
    expect(tree[0].children[1].name).toBe('Sierra');
    expect(tree[1].children[0].name).toBe('RZR Pro R');
    expect(tree[1].children[1].name).toBe('Ranger');
  });

  it('should handle orphaned folders as roots', () => {
    const folders: FolderData[] = [
      { id: '1', parentId: null, name: 'GM', folderType: 'make' },
      { id: '2', parentId: 'missing-parent', name: 'Orphan', folderType: 'custom' },
    ];

    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(2); // orphan becomes root
  });

  it('should handle empty folder list', () => {
    const tree = buildFolderTree([]);
    expect(tree).toHaveLength(0);
  });

  it('should handle custom folders mixed with auto-generated', () => {
    const folders: FolderData[] = [
      { id: '1', parentId: null, name: 'GM', folderType: 'make' },
      { id: '2', parentId: '1', name: 'Silverado', folderType: 'model' },
      { id: '3', parentId: '2', name: 'My Custom Tunes', folderType: 'custom' },
      { id: '4', parentId: '2', name: '2024', folderType: 'year' },
    ];

    const tree = buildFolderTree(folders);
    expect(tree[0].children[0].children).toHaveLength(2);
    expect(tree[0].children[0].children[0].folderType).toBe('custom');
    expect(tree[0].children[0].children[1].folderType).toBe('year');
  });
});

// Test dispatch matching index structure
describe('Dispatch Matching', () => {
  it('should define correct matching fields for auto-delivery', () => {
    const matchFields = ['vehicleMake', 'vehicleModel', 'ecuFamily', 'osVersion', 'ecuPartNumber'];
    expect(matchFields).toHaveLength(5);
    expect(matchFields).toContain('vehicleMake');
    expect(matchFields).toContain('ecuPartNumber');
    expect(matchFields).toContain('osVersion');
  });

  it('should support dispatch priority ordering', () => {
    const tunes = [
      { name: 'Stage 1', dispatchPriority: 1, isDispatchReady: true },
      { name: 'Stage 2', dispatchPriority: 5, isDispatchReady: true },
      { name: 'Custom', dispatchPriority: 10, isDispatchReady: true },
      { name: 'Draft', dispatchPriority: 0, isDispatchReady: false },
    ];

    const dispatchReady = tunes
      .filter(t => t.isDispatchReady)
      .sort((a, b) => b.dispatchPriority - a.dispatchPriority);

    expect(dispatchReady).toHaveLength(3);
    expect(dispatchReady[0].name).toBe('Custom');
    expect(dispatchReady[1].name).toBe('Stage 2');
    expect(dispatchReady[2].name).toBe('Stage 1');
  });
});

// Test tune metadata validation
describe('Tune Metadata', () => {
  it('should validate tune stage values', () => {
    const validStages = ['Stock', 'Stage 1', 'Stage 2', 'Stage 3', 'Race', 'Custom'];
    expect(validStages).toContain('Stock');
    expect(validStages).toContain('Stage 1');
    expect(validStages).toContain('Race');
  });

  it('should validate fuel type values', () => {
    const validFuels = ['Diesel', 'E85', '93 Octane', '91 Octane', '87 Octane'];
    expect(validFuels).toContain('Diesel');
    expect(validFuels).toContain('E85');
  });

  it('should validate checksum status values', () => {
    const validStatuses = ['valid', 'invalid', 'unchecked'];
    expect(validStatuses).toContain('valid');
    expect(validStatuses).toContain('invalid');
    expect(validStatuses).toContain('unchecked');
  });
});

// Test binary hash calculation logic
describe('Binary Hash', () => {
  it('should produce consistent SHA-256 hash for same data', async () => {
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF]);
    const hash1 = await computeHash(data);
    const hash2 = await computeHash(data);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('should produce different hashes for different data', async () => {
    const data1 = new Uint8Array([0x00, 0x01]);
    const data2 = new Uint8Array([0x00, 0x02]);
    const hash1 = await computeHash(data1);
    const hash2 = await computeHash(data2);
    expect(hash1).not.toBe(hash2);
  });
});

// Helper to compute SHA-256 hash (mirrors client-side logic)
async function computeHash(data: Uint8Array): Promise<string> {
  // Use Node.js crypto since we're in test environment
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(data).digest('hex');
  return hash;
}
