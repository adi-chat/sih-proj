import { create } from 'zustand';

export const ALL_CLASSIFICATIONS = [
  'PERSON',
  'ACCOUNT_UPI',
  'VEHICLE',
  'CRIME_INCIDENT',
  'PHONE_MSISDN',
  'CELL_TOWER_CGI',
  'COMPLAINANT',
  'ATM'
];

export const useStore = create((set) => ({
  // --- Authentication & Session State ---
  isAuthenticated: false,
  activeCaseId: '',
  operatorBadge: 'OP-ADMIN-01',
  inspectorOpen: true,
  activeModule: 'network',
  selectedNode: null,

  // --- Hopfield Attractor State ---
  showHopfieldScore: false,
  toggleHopfieldScore: () => set((state) => ({ showHopfieldScore: !state.showHopfieldScore })),
  archetypeData: null,
  setArchetypeData: (data) => set({ archetypeData: data }),

  // --- Reversible Node Removal / Inventory Tray State ---
  trayOpen: false,
  setTrayOpen: (open) => set({ trayOpen: open }),
  hiddenNodes: [],
  hideNode: (nodeData) => set((state) => {
    const list = state.hiddenNodes || [];
    const clearOrigin = String(state.routeOrigin?.id) === String(nodeData.id) ? null : state.routeOrigin;
    const clearTarget = String(state.routeTarget?.id) === String(nodeData.id) ? null : state.routeTarget;
    return {
      hiddenNodes: [...list.filter((n) => String(n.id) !== String(nodeData.id)), nodeData],
      routeOrigin: clearOrigin,
      routeTarget: clearTarget,
      trayOpen: true
    };
  }),
  restoreNode: (nodeId) => set((state) => ({
    hiddenNodes: (state.hiddenNodes || []).filter((n) => String(n.id) !== String(nodeId))
  })),
  restoreAllNodes: () => set({ 
    hiddenNodes: [],
    trayOpen: false 
  }),

  // --- BFS Route State ---
  routeOrigin: null,
  routeTarget: null,

  // --- Regional Jurisdiction Scope ---
  jurisdictionScope: 'national', // 'national' | 'state' | 'district' | 'precinct'

  // --- Ingestion Mode ---
  evidenceMode: 'database', // 'database' | 'uploaded'
  uploadedFiles: [],        
  uploadedExhibitHash: null,
  uploadedEntityMap: {},

  // --- Classification Node Filter State ---
  enabledNodeTypes: ALL_CLASSIFICATIONS,
  toggleNodeType: (type) => set((state) => {
    const isEnabled = state.enabledNodeTypes.includes(type);
    return {
      enabledNodeTypes: isEnabled
        ? state.enabledNodeTypes.filter((t) => t !== type)
        : [...state.enabledNodeTypes, type]
    };
  }),
  setAllNodeTypes: (types) => set({ enabledNodeTypes: types }),

  // --- Session Handlers ---
  login: (badge = 'OP-ADMIN-01', caseId = '') => set({
    isAuthenticated: true,
    operatorBadge: badge,
    activeCaseId: caseId,
    evidenceMode: 'database',
    hiddenNodes: [],
    trayOpen: false,
    selectedNode: null,
    routeOrigin: null,
    routeTarget: null
  }),
  logout: () => set({
    isAuthenticated: false,
    activeCaseId: '',
    selectedNode: null,
    routeOrigin: null,
    routeTarget: null,
    evidenceMode: 'database',
    uploadedExhibitHash: null,
    hiddenNodes: [],
    trayOpen: false,
    inspectorOpen: false
  }),
  setActiveCase: (id) => set({ 
    activeCaseId: id, 
    routeOrigin: null, 
    routeTarget: null,
    selectedNode: null,
    evidenceMode: 'database',
    uploadedExhibitHash: null,
    hiddenNodes: [],
    trayOpen: false,
    archetypeData: null,
    inspectorOpen: false // Collapses panel whenever a case is queried
  }),
  setModule: (module) => set((state) => ({ 
    activeModule: module,
    trayOpen: module === 'network' ? state.trayOpen : false,
    // Collapses panel when leaving the network module to any of the other three
    inspectorOpen: (state.activeModule === 'network' && module !== 'network')
      ? false
      : (module !== 'network' ? false : state.inspectorOpen)
  })),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setSelectedNode: (nodeData) => set({ selectedNode: nodeData, inspectorOpen: true }),
  setRouteOrigin: (node) => set({ routeOrigin: node }),
  setRouteTarget: (node) => set({ routeTarget: node }),
  clearRoute: () => set({ routeOrigin: null, routeTarget: null }),
  setJurisdictionScope: (scope) => set({ jurisdictionScope: scope }),
  setUploadedEvidence: (files, hash, entityMap) => set({
    evidenceMode: 'uploaded',
    uploadedFiles: files,
    uploadedExhibitHash: hash,
    uploadedEntityMap: entityMap,
    routeOrigin: null,
    routeTarget: null,
    selectedNode: null,
    hiddenNodes: [],
    trayOpen: false,
    inspectorOpen: false
  }),
  resetToDatabaseMode: () => set({
    evidenceMode: 'database',
    uploadedFiles: [],
    uploadedExhibitHash: null,
    uploadedEntityMap: {},
    routeOrigin: null,
    routeTarget: null,
    selectedNode: null,
    hiddenNodes: [],
    trayOpen: false,
    inspectorOpen: false
  })
}));