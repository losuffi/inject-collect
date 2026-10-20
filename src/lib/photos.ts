import type { Case, Phase, Photo, View } from './model';
import { processPhoto } from './image';
import { deleteBlobs, putBlob, thumbKey } from './db';
import { uid } from './ids';

/** 导入一张照片并存入 IndexedDB，返回 Photo 记录（尚未加入病例） */
export async function importPhoto(file: Blob, phase: Phase, view: View): Promise<Photo> {
  const p = await processPhoto(file);
  const id = uid('ph_');
  await putBlob(id, p.full);
  await putBlob(thumbKey(id), p.thumb);
  return {
    id, phase, view, blobKey: id, width: p.width, height: p.height, takenAt: new Date().toISOString(), quality: p.quality,
  };
}

/** 把照片放进病例（同阶段同角度的旧照片被替换）；返回新病例和需要删除的旧照片 */
export function placePhoto(c: Case, photo: Photo): { next: Case; replaced?: Photo } {
  const replaced = c.photos.find((p) => p.phase === photo.phase && p.view === photo.view);
  let next: Case = { ...c, photos: [...c.photos.filter((p) => p !== replaced), photo] };
  if (replaced) next = dropAnnotations(next, replaced.id);
  return { next, replaced };
}

export function removePhoto(c: Case, photo: Photo): Case {
  return dropAnnotations({ ...c, photos: c.photos.filter((p) => p.id !== photo.id) }, photo.id);
}

/** 标注依附在具体照片上，照片换掉后旧标注失效 */
function dropAnnotations(c: Case, photoId: string): Case {
  return {
    ...c,
    points: c.points.filter((p) => p.photoId !== photoId),
    pupils: c.pupils?.photoId === photoId ? undefined : c.pupils,
  };
}

export const annotationCount = (c: Case, photoId: string) =>
  c.points.filter((p) => p.photoId === photoId).length + (c.pupils?.photoId === photoId ? 1 : 0);

export const discardPhotoBlobs = (p: Photo) => deleteBlobs([p.blobKey, thumbKey(p.blobKey)]);
