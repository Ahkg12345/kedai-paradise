BEGIN;

-- Demo only, delete before launch.
WITH demo_items (sort_order, name, category, price, cost_price, photo, available) AS (
  VALUES
    (1, 'Mie Goreng', 'Makanan', 14000, 9000, 'menu/4db73457-439d-42f2-ad6a-863312bd56a9.png', true),
    (2, 'Kopi Susu', 'Minuman', 18000, 10000, 'menu/02e60daf-387b-4722-9311-a1066a5ae9ba.png', true),
    (3, 'Es Teh', 'Minuman', 5000, 2000, 'menu/7e041cff-3b46-4841-a974-7d16949a1abd.png', true),
    (4, 'Roti Bakar', 'Snack', 12000, 7500, 'menu/5b29e664-e666-49a0-b15e-2540de0adae7.png', true),
    (5, 'Air Mineral', 'Minuman', 4000, 2500, NULL, false),
    (6, 'Nasi Goreng', 'Makanan', 16000, 9000, 'menu/78194ca5-2ae4-4165-be63-9f68ae1e7db0.png', true),
    (7, 'Teh Hangat', 'Minuman', 4000, 1500, 'menu/0a4f5f8d-b223-482e-ac43-f93d30c76dee.png', true),
    (8, 'Kentang Goreng', 'Snack', 10000, 5500, 'menu/c336a055-ead4-44ef-a2d8-4ef3333b3403.png', true)
)
INSERT INTO public.menu (name, category, price, cost_price, photo, available, status)
SELECT seed.name, seed.category, seed.price, seed.cost_price, seed.photo, seed.available, true
FROM demo_items AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu AS existing WHERE existing.name = seed.name
)
ORDER BY seed.sort_order;

WITH demo_groups (menu_name, name, type, is_required) AS (
  VALUES
    ('Mie Goreng', 'Tingkat Pedas', 'single'::public.modifier_group_type, true),
    ('Mie Goreng', 'Toppings / Tambahan', 'multiple'::public.modifier_group_type, false),
    ('Kopi Susu', 'Ukuran', 'single'::public.modifier_group_type, true)
)
INSERT INTO public.menu_modifier_groups (menu_id, name, type, is_required)
SELECT menu.menu_id, seed.name, seed.type, seed.is_required
FROM demo_groups AS seed
JOIN public.menu AS menu ON menu.name = seed.menu_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.menu_modifier_groups AS existing
  WHERE existing.menu_id = menu.menu_id AND existing.name = seed.name
);

WITH demo_modifiers (menu_name, group_name, name, extra_price, extra_cost, available, hint, sort_order) AS (
  VALUES
    ('Mie Goreng', 'Tingkat Pedas', 'Level 1', 0, 0, true, 'Tidak Pedas', 1),
    ('Mie Goreng', 'Tingkat Pedas', 'Level 2', 0, 0, true, 'Sedang', 2),
    ('Mie Goreng', 'Tingkat Pedas', 'Level 3', 0, 0, true, 'Sangat Pedas', 3),
    ('Mie Goreng', 'Toppings / Tambahan', 'Telur Tambahan', 3000, 2000, true, NULL, 1),
    ('Mie Goreng', 'Toppings / Tambahan', 'Sosis', 4000, 2500, true, '+1 Porsi', 2),
    ('Mie Goreng', 'Toppings / Tambahan', 'Keju', 3000, 1500, false, NULL, 3),
    ('Kopi Susu', 'Ukuran', 'Reguler', 0, 0, true, NULL, 1),
    ('Kopi Susu', 'Ukuran', 'Large', 4000, 1500, true, NULL, 2)
)
INSERT INTO public.menu_modifier_items (group_id, name, extra_price, extra_cost, available, hint)
SELECT groups.group_id, seed.name, seed.extra_price, seed.extra_cost, seed.available, seed.hint
FROM demo_modifiers AS seed
JOIN public.menu AS menu ON menu.name = seed.menu_name
JOIN public.menu_modifier_groups AS groups ON groups.menu_id = menu.menu_id AND groups.name = seed.group_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_modifier_items AS existing
  WHERE existing.group_id = groups.group_id AND existing.name = seed.name
)
ORDER BY menu.menu_id, groups.group_id, seed.sort_order;

COMMIT;
