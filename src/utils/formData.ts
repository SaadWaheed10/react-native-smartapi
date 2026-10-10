export type RnFile = { uri: string; name: string; type: string };

export type FormDataValue =
  | string
  | number
  | boolean
  | Blob
  | File
  | RnFile
  | null
  | undefined
  | FormDataValue[];

/**
 * Build a React Native–friendly `FormData` from a plain object.
 * Arrays are appended under the same key (multi-file uploads).
 *
 *   createFormData({
 *     avatar: { uri, name: 'a.jpg', type: 'image/jpeg' },
 *     tags: ['a', 'b'],
 *     userId: 12,
 *   })
 */
export function createFormData(fields: Record<string, FormDataValue>): FormData {
  const form = new FormData();

  const append = (key: string, value: FormDataValue) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item) => append(key, item));
      return;
    }

    if (typeof value === 'boolean' || typeof value === 'number') {
      form.append(key, String(value));
      return;
    }

    // RN file shape or Blob/File/string
    form.append(key, value as any);
  };

  Object.entries(fields).forEach(([key, value]) => append(key, value));
  return form;
}
