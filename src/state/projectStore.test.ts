import { beforeEach, describe, expect, it } from 'vitest';
import { createClipSceneFromAsset } from '../domain/layerFactory';
import type { MediaAsset, Project, Scene } from '../domain/types';
import { useProjectStore } from './projectStore';

function scene(id: string, layers: Scene['layers'] = []): Scene {
  return { id, duration: 5000, layers };
}

function project(scenes: Scene[]): Project {
  return {
    id: 'p',
    name: 'p',
    createdAt: 0,
    updatedAt: 0,
    aspectRatio: '16:9',
    resolution: { width: 1280, height: 720 },
    fps: 30,
    scenes,
    mediaLibrary: [],
  };
}

const video = (id: string, durationMs: number): MediaAsset => ({
  id,
  kind: 'video',
  name: id,
  durationMs,
  width: 1920,
  height: 1080,
  createdAt: 0,
  sizeBytes: 1,
});

describe('moveScene', () => {
  beforeEach(() => useProjectStore.getState().loadProject(project([scene('a'), scene('b'), scene('c')])));

  it('swaps a scene with its neighbour', () => {
    expect(useProjectStore.getState().moveScene('b', -1)).toBe(true);
    expect(useProjectStore.getState().project!.scenes.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(useProjectStore.getState().moveScene('b', 1)).toBe(true);
    expect(useProjectStore.getState().project!.scenes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('does nothing at either end', () => {
    expect(useProjectStore.getState().moveScene('a', -1)).toBe(false);
    expect(useProjectStore.getState().moveScene('c', 1)).toBe(false);
    expect(useProjectStore.getState().project!.scenes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('insertScenesAfter / createClipSceneFromAsset', () => {
  it('chains clips as consecutive scenes, each as long as its video, instead of stacking layers', () => {
    const p = project([scene('a', [{ id: 'l', type: 'text' } as never])]);
    useProjectStore.getState().loadProject(p);
    const clips = [video('v1', 3000), video('v2', 7000)].map((v) => createClipSceneFromAsset(p, v)!);
    useProjectStore.getState().insertScenesAfter('a', clips);
    const scenes = useProjectStore.getState().project!.scenes;
    expect(scenes).toHaveLength(3);
    expect(scenes.slice(1).map((s) => s.duration)).toEqual([3000, 7000]);
    expect(scenes.slice(1).every((s) => s.layers.length === 1)).toBe(true);
  });

  it('replaces an empty current scene with the first clip', () => {
    const p = project([scene('a'), scene('b')]);
    useProjectStore.getState().loadProject(p);
    const clips = [video('v1', 3000), video('v2', 4000)].map((v) => createClipSceneFromAsset(p, v)!);
    useProjectStore.getState().insertScenesAfter('a', clips);
    const scenes = useProjectStore.getState().project!.scenes;
    expect(scenes.map((s) => s.duration)).toEqual([3000, 4000, 5000]);
    expect(scenes.map((s) => s.id)).not.toContain('a');
  });

  it('ignores audio assets', () => {
    expect(createClipSceneFromAsset(project([]), { ...video('x', 1000), kind: 'audio' })).toBeNull();
  });
});
