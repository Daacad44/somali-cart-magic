-- Demo catalogue (safe to re-run)
insert into public.categories (name, name_so, slug, description, icon, sort_order) values
  ('Electronics',   'Elektaroonig',     'electronics', 'Latest gadgets & devices', '📱', 1),
  ('Fashion',       'Dhar & Moodo',     'fashion',     'Trending styles & apparel', '👗', 2),
  ('Home & Living', 'Guriga',           'home-living', 'Furniture & home décor',    '🏠', 3),
  ('Beauty',        'Qurxinta',         'beauty',      'Skincare & cosmetics',      '✨', 4),
  ('Sports',        'Isboorti',         'sports',      'Athletic gear & equipment', '⚽', 5)
on conflict (slug) do nothing;

insert into public.products (name, name_so, slug, description, description_so, category_id, price, compare_at_price,
                             sku, stock, images, variant_options, tags, is_featured, flash_sale_ends_at, rating, review_count)
select v.name, v.name_so, v.slug, v.description, v.description_so, c.id, v.price, v.compare_at_price,
       v.sku, v.stock, v.images, v.variant_options::jsonb, v.tags, v.is_featured,
       case when v.flash then now() + interval '14 days' end, v.rating, v.review_count
from (values
  ('Premium Wireless Headphones','Dhegaha Wireless-ka ee Premium','premium-wireless-headphones',
   'Noise-cancelling wireless headphones with crystal-clear sound.','Dhegaha wireless-ka ah ee buuqa joojiya, cod cad.',
   'electronics', 89.99, 129.99, 'EL-WH-001', 25, array['/products/headphones.jpg'],
   '[{"type":"Color","options":["Navy","Black","White"]}]', array['bestseller','audio'], true, true, 4.8, 234),
  ('Elegant Silk Dress','Dharka Xariirta ah','elegant-silk-dress',
   'Luxurious silk dress for special occasions.','Dhar xariir ah oo loogu talagalay munaasabadaha.',
   'fashion', 149.99, 199.99, 'FA-SD-002', 12, array['/products/silk-dress.jpg'],
   '[{"type":"Size","options":["S","M","L","XL"]},{"type":"Color","options":["Navy","Burgundy","Black"]}]', array['premium'], true, false, 4.6, 87),
  ('Smart Watch Pro','Saacadda Smart Pro','smart-watch-pro',
   'Track fitness, manage notifications and stay connected.','La soco jirkaaga, ogeysiisyada iyo xiriirka.',
   'electronics', 199.99, 249.99, 'EL-SW-003', 18, array['/products/smartwatch.jpg'],
   '[{"type":"Size","options":["40mm","44mm"]}]', array['smart','trending'], true, true, 4.7, 456),
  ('Organic Skincare Set','Qalabka Daryeelka Maqaarka','organic-skincare-set',
   'Cleanser, toner, serum and moisturizer — organic and cruelty-free.','Nadiifiye, toner, serum iyo qoyaan — dabiici.',
   'beauty', 79.99, null, 'BE-OS-004', 7, array['/products/skincare-set.jpg'],
   '[]', array['organic','bestseller'], true, false, 4.9, 312),
  ('Modern Coffee Table','Miiska Fadhiga Casriga ah','modern-coffee-table',
   'Solid oak coffee table with steel accents.','Miis alwaax adag ah oo bir lagu qurxiyay.',
   'home-living', 299.99, 399.99, 'HL-CT-005', 5, array['/products/coffee-table.jpg'],
   '[{"type":"Wood","options":["Oak","Walnut","Maple"]}]', array['furniture'], false, false, 4.5, 45),
  ('Running Shoes Elite','Kabaha Orodka Elite','running-shoes-elite',
   'Responsive cushioning and breathable mesh upper.','Kabo fudud oo neefsasho leh.',
   'sports', 129.99, null, 'SP-RS-006', 30, array['/products/running-shoes.jpg'],
   '[{"type":"Size","options":["40","41","42","43","44","45"]},{"type":"Color","options":["Navy/Orange","Black/White"]}]', array['running','new'], false, false, 4.7, 189),
  ('Leather Messenger Bag','Boorsada Harag','leather-messenger-bag',
   'Handcrafted leather bag with padded laptop compartment.','Boorso harag ah oo laptop qaadi karta.',
   'fashion', 189.99, 239.99, 'FA-MB-007', 9, array['/products/messenger-bag.jpg'],
   '[{"type":"Color","options":["Brown","Black","Tan"]}]', array['leather'], false, false, 4.8, 156),
  ('Wireless Speaker System','Sameecadda Wireless-ka','wireless-speaker-system',
   'Room-filling sound with deep bass.','Cod buuxa oo bass qoto dheer leh.',
   'electronics', 159.99, null, 'EL-WS-008', 3, array['/products/speaker.jpg'],
   '[]', array['audio','wireless'], false, false, 4.6, 98)
) as v(name, name_so, slug, description, description_so, cat_slug, price, compare_at_price, sku, stock, images,
       variant_options, tags, is_featured, flash, rating, review_count)
join public.categories c on c.slug = v.cat_slug
on conflict (slug) do nothing;
