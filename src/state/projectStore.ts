import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { splitSceneAt } from '../domain/timeline';
import type { AspectRatio, Layer, MediaAsset, Project, Scene } from '../domain/types';
import { ASPECT_RATIO_RESOLUTIONS } from '../domain/types';

const MAX_HISTORY = 100;

interface EditorState {
  project: Project | null;
  selectedLayerIds: string[];
  past: Project[];
  future: Project[];

  loadProject: (project: Project) => void;
  closeProject: () => void;

  addScene: () => string | null;
  removeScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string) => string | null;
  splitScene: (sceneId: string, localTimeMs: number) => string | null;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  /** シーンを前(-1)/後ろ(+1)へ1つ入れ替える。端なら何もせずfalseを返す。 */
  moveScene: (sceneId: string, delta: -1 | 1) => boolean;
  /**
   * 指定シーンの直後に複数シーンを連続で挿入する(1回の操作=1回の取り消し単位)。
   * 指定シーンが空(レイヤー無し)なら、そのシーンを最初の新シーンで置き換える。
   */
  insertScenesAfter: (afterSceneId: string, scenes: Scene[]) => void;
  updateSceneDuration: (sceneId: string, duration: number) => void;
  updateScene: (sceneId: string, patch: Partial<Scene>) => void;

  addMediaAsset: (asset: MediaAsset) => void;
  removeMediaAsset: (mediaId: string) => void;

  addLayerToScene: (sceneId: string, layer: Layer) => void;
  updateLayer: (sceneId: string, layerId: string, patch: Partial<Layer>) => void;
  removeLayer: (sceneId: string, layerId: string) => void;
  selectLayer: (layerId: string | null, options?: { additive?: boolean }) => void;

  renameProject: (name: string) => void;
  setAspectRatio: (ratio: AspectRatio) => void;

  undo: () => void;
  redo: () => void;
}

function touch(): Pick<Project, 'updatedAt'> {
  return { updatedAt: Date.now() };
}

function emptyScene(): Scene {
  return { id: nanoid(), duration: 5000, layers: [] };
}

export const useProjectStore = create<EditorState>((set, get) => {
  /** すべての変更系アクションはこれを経由する。変更前の project を past に積み、future をクリアする。 */
  function commit(project: Project, extra?: Partial<EditorState>) {
    set((state) => ({
      project,
      past: state.project ? [...state.past, state.project].slice(-MAX_HISTORY) : state.past,
      future: [],
      ...extra,
    }));
  }

  return {
    project: null,
    selectedLayerIds: [],
    past: [],
    future: [],

    loadProject: (project) => set({ project, selectedLayerIds: [], past: [], future: [] }),

    closeProject: () => set({ project: null, selectedLayerIds: [], past: [], future: [] }),

    addScene: () => {
      const state = get();
      if (!state.project) return null;
      const scene = emptyScene();
      commit(
        { ...state.project, scenes: [...state.project.scenes, scene], ...touch() },
        { selectedLayerIds: [] },
      );
      return scene.id;
    },

    removeScene: (sceneId) => {
      const state = get();
      if (!state.project) return;
      const scenes = state.project.scenes.filter((s) => s.id !== sceneId);
      if (scenes.length === 0) scenes.push(emptyScene());
      commit({ ...state.project, scenes, ...touch() }, { selectedLayerIds: [] });
    },

    duplicateScene: (sceneId) => {
      const state = get();
      if (!state.project) return null;
      const index = state.project.scenes.findIndex((s) => s.id === sceneId);
      if (index === -1) return null;
      const original = state.project.scenes[index];
      const copy: Scene = {
        ...original,
        id: nanoid(),
        layers: original.layers.map((l) => ({ ...l, id: nanoid() })),
      };
      const scenes = [...state.project.scenes];
      scenes.splice(index + 1, 0, copy);
      commit({ ...state.project, scenes, ...touch() }, { selectedLayerIds: [] });
      return copy.id;
    },

    splitScene: (sceneId, localTimeMs) => {
      const state = get();
      if (!state.project) return null;
      const result = splitSceneAt(state.project.scenes, sceneId, localTimeMs);
      if (!result) return null;
      commit({ ...state.project, scenes: result.scenes, ...touch() }, { selectedLayerIds: [] });
      return result.newSceneId;
    },

    reorderScenes: (fromIndex, toIndex) => {
      const state = get();
      if (!state.project) return;
      const scenes = [...state.project.scenes];
      const [moved] = scenes.splice(fromIndex, 1);
      scenes.splice(toIndex, 0, moved);
      commit({ ...state.project, scenes, ...touch() });
    },

    moveScene: (sceneId, delta) => {
      const state = get();
      if (!state.project) return false;
      const from = state.project.scenes.findIndex((s) => s.id === sceneId);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= state.project.scenes.length) return false;
      const scenes = [...state.project.scenes];
      const [moved] = scenes.splice(from, 1);
      scenes.splice(to, 0, moved);
      commit({ ...state.project, scenes, ...touch() });
      return true;
    },

    insertScenesAfter: (afterSceneId, newScenes) => {
      const state = get();
      if (!state.project || newScenes.length === 0) return;
      const index = state.project.scenes.findIndex((s) => s.id === afterSceneId);
      if (index === -1) return;
      const scenes = [...state.project.scenes];
      const target = scenes[index];
      const replace = target.layers.length === 0 && !target.transitionOut;
      scenes.splice(replace ? index : index + 1, replace ? 1 : 0, ...newScenes);
      commit({ ...state.project, scenes, ...touch() }, { selectedLayerIds: [] });
    },

    updateSceneDuration: (sceneId, duration) => {
      const state = get();
      if (!state.project) return;
      const scenes = state.project.scenes.map((s) => (s.id === sceneId ? { ...s, duration } : s));
      commit({ ...state.project, scenes, ...touch() });
    },

    updateScene: (sceneId, patch) => {
      const state = get();
      if (!state.project) return;
      const scenes = state.project.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s));
      commit({ ...state.project, scenes, ...touch() });
    },

    addMediaAsset: (asset) => {
      const state = get();
      if (!state.project) return;
      commit({
        ...state.project,
        mediaLibrary: [...state.project.mediaLibrary, asset],
        ...touch(),
      });
    },

    removeMediaAsset: (mediaId) => {
      const state = get();
      if (!state.project) return;
      commit({
        ...state.project,
        mediaLibrary: state.project.mediaLibrary.filter((m) => m.id !== mediaId),
        scenes: state.project.scenes.map((s) => ({
          ...s,
          layers: s.layers.filter((l) => !('mediaId' in l) || l.mediaId !== mediaId),
        })),
        ...touch(),
      });
    },

    addLayerToScene: (sceneId, layer) => {
      const state = get();
      if (!state.project) return;
      const scenes = state.project.scenes.map((s) =>
        s.id === sceneId ? { ...s, layers: [...s.layers, layer] } : s,
      );
      commit({ ...state.project, scenes, ...touch() }, { selectedLayerIds: [layer.id] });
    },

    updateLayer: (sceneId, layerId, patch) => {
      const state = get();
      if (!state.project) return;
      const scenes = state.project.scenes.map((s) =>
        s.id !== sceneId
          ? s
          : {
              ...s,
              layers: s.layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as Layer) : l)),
            },
      );
      commit({ ...state.project, scenes, ...touch() });
    },

    removeLayer: (sceneId, layerId) => {
      const state = get();
      if (!state.project) return;
      const scenes = state.project.scenes.map((s) =>
        s.id !== sceneId ? s : { ...s, layers: s.layers.filter((l) => l.id !== layerId) },
      );
      const selectedLayerIds = state.selectedLayerIds.filter((id) => id !== layerId);
      commit({ ...state.project, scenes, ...touch() }, { selectedLayerIds });
    },

    selectLayer: (layerId, options) =>
      set((state) => {
        if (layerId === null) return { selectedLayerIds: [] };
        if (options?.additive) {
          const exists = state.selectedLayerIds.includes(layerId);
          return {
            selectedLayerIds: exists
              ? state.selectedLayerIds.filter((id) => id !== layerId)
              : [...state.selectedLayerIds, layerId],
          };
        }
        return { selectedLayerIds: [layerId] };
      }),

    renameProject: (name) => {
      const state = get();
      if (!state.project) return;
      commit({ ...state.project, name, ...touch() });
    },

    setAspectRatio: (aspectRatio) => {
      const state = get();
      if (!state.project) return;
      commit({
        ...state.project,
        aspectRatio,
        resolution: ASPECT_RATIO_RESOLUTIONS[aspectRatio],
        ...touch(),
      });
    },

    undo: () =>
      set((state) => {
        if (state.past.length === 0 || !state.project) return state;
        const previous = state.past[state.past.length - 1];
        const past = state.past.slice(0, -1);
        const future = [state.project, ...state.future].slice(0, MAX_HISTORY);
        return { project: previous, past, future, selectedLayerIds: [] };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0 || !state.project) return state;
        const next = state.future[0];
        const future = state.future.slice(1);
        const past = [...state.past, state.project].slice(-MAX_HISTORY);
        return { project: next, past, future, selectedLayerIds: [] };
      }),
  };
});
