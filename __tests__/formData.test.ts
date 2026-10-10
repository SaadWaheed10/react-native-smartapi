import { createFormData } from '../src/utils/formData';

describe('createFormData', () => {
  it('appends scalars, arrays, and RN file shapes', () => {
    const append = jest.fn();
    const OriginalFormData = (global as any).FormData;

    (global as any).FormData = jest.fn().mockImplementation(() => ({ append }));

    createFormData({
      userId: 12,
      active: true,
      tags: ['a', 'b'],
      skip: null,
      avatar: { uri: 'file://a.jpg', name: 'a.jpg', type: 'image/jpeg' },
    });

    expect(append).toHaveBeenCalledWith('userId', '12');
    expect(append).toHaveBeenCalledWith('active', 'true');
    expect(append).toHaveBeenCalledWith('tags', 'a');
    expect(append).toHaveBeenCalledWith('tags', 'b');
    expect(append).toHaveBeenCalledWith('avatar', {
      uri: 'file://a.jpg',
      name: 'a.jpg',
      type: 'image/jpeg',
    });
    expect(append).not.toHaveBeenCalledWith('skip', expect.anything());

    (global as any).FormData = OriginalFormData;
  });
});
