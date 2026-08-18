const pool = require('../config/database');

const SQL = {
  INSERT_ORDER_FULL: `INSERT INTO orders (user_id, order_number, total_amount, shipping_address_id, 
         billing_address_id, payment_method, notes, guest_checkout, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
  INSERT_ORDER_ITEM_WITH_JOB: `INSERT INTO order_items (order_id, product_id, product_name, job_name, quantity, unit_price, total_price, image_url, width_inches, height_inches, selected_modifiers, selection_mode, graphic_scenario_enabled, modifier_total, base_unit_price, purchase_option_key, purchase_option_label, discount_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18)`,
  SELECT_ORDER_WITH_ITEMS_AGG: `SELECT o.*, 
         json_agg(json_build_object(
           'id', oi.id,
           'product_id', oi.product_id,
           'product_name', oi.product_name,
           'quantity', oi.quantity,
           'unit_price', oi.unit_price,
           'total_price', oi.total_price,
           'discount_amount', COALESCE(oi.discount_amount, 0),
           'width_inches', oi.width_inches,
           'height_inches', oi.height_inches,
            'customer_artwork_url', oi.customer_artwork_url,
            'selected_modifiers', oi.selected_modifiers,
            'modifier_total', oi.modifier_total,
           'base_unit_price', oi.base_unit_price,
           'selection_mode', oi.selection_mode,
           'graphic_scenario_enabled', oi.graphic_scenario_enabled,
           'purchase_option_key', oi.purchase_option_key,
           'purchase_option_label', oi.purchase_option_label,
           'status', oi.status,
           'refund_amount', oi.refund_amount,
           'product_graphic_scenario_enabled', p.graphic_scenario_enabled
         )) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE o.id = $1
         GROUP BY o.id`,
  ORDERS_FOR_USER_WITH_STATUS: `SELECT o.*, 
      MAX(sa.street_address) as shipping_street_address,
      MAX(sa.address_line2) as shipping_address_line2,
      MAX(sa.city) as shipping_city,
      MAX(sa.state) as shipping_state,
      MAX(sa.postcode) as shipping_postcode,
      MAX(sa.country) as shipping_country,
      MAX(ba.street_address) as billing_street_address,
      MAX(ba.address_line2) as billing_address_line2,
      MAX(ba.city) as billing_city,
      MAX(ba.state) as billing_state,
      MAX(ba.postcode) as billing_postcode,
      MAX(ba.country) as billing_country,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'job_name', oi.job_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'discount_amount', COALESCE(oi.discount_amount, 0),
            'image_url', COALESCE(oi.image_url, p.image_url),
            'width_inches', oi.width_inches,
            'height_inches', oi.height_inches,
            'customer_artwork_url', oi.customer_artwork_url,
            'selected_modifiers', oi.selected_modifiers,
            'modifier_total', oi.modifier_total,
            'base_unit_price', oi.base_unit_price,
            'selection_mode', oi.selection_mode,
            'graphic_scenario_enabled', oi.graphic_scenario_enabled,
            'purchase_option_key', oi.purchase_option_key,
            'purchase_option_label', oi.purchase_option_label,
            'status', oi.status,
            'refund_amount', oi.refund_amount,
            'product_graphic_scenario_enabled', p.graphic_scenario_enabled
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.id
      WHERE o.user_id = $1 AND o.status = $2
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`,
  ORDERS_FOR_USER: `SELECT o.*, 
      MAX(sa.street_address) as shipping_street_address,
      MAX(sa.address_line2) as shipping_address_line2,
      MAX(sa.city) as shipping_city,
      MAX(sa.state) as shipping_state,
      MAX(sa.postcode) as shipping_postcode,
      MAX(sa.country) as shipping_country,
      MAX(ba.street_address) as billing_street_address,
      MAX(ba.address_line2) as billing_address_line2,
      MAX(ba.city) as billing_city,
      MAX(ba.state) as billing_state,
      MAX(ba.postcode) as billing_postcode,
      MAX(ba.country) as billing_country,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'job_name', oi.job_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'discount_amount', COALESCE(oi.discount_amount, 0),
            'image_url', COALESCE(oi.image_url, p.image_url),
            'width_inches', oi.width_inches,
            'height_inches', oi.height_inches,
            'customer_artwork_url', oi.customer_artwork_url,
            'selected_modifiers', oi.selected_modifiers,
            'modifier_total', oi.modifier_total,
            'base_unit_price', oi.base_unit_price,
            'selection_mode', oi.selection_mode,
            'graphic_scenario_enabled', oi.graphic_scenario_enabled,
            'purchase_option_key', oi.purchase_option_key,
            'purchase_option_label', oi.purchase_option_label,
            'status', oi.status,
            'refund_amount', oi.refund_amount,
            'product_graphic_scenario_enabled', p.graphic_scenario_enabled
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.id
      WHERE o.user_id = $1
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
  ORDER_BY_ID_AND_USER: `SELECT o.*, 
       MAX(sa.street_address) as shipping_street_address,
       MAX(sa.address_line2) as shipping_address_line2,
       MAX(sa.city) as shipping_city,
       MAX(sa.state) as shipping_state,
       MAX(sa.postcode) as shipping_postcode,
       MAX(sa.country) as shipping_country,
       MAX(ba.street_address) as billing_street_address,
       MAX(ba.address_line2) as billing_address_line2,
       MAX(ba.city) as billing_city,
       MAX(ba.state) as billing_state,
       MAX(ba.postcode) as billing_postcode,
       MAX(ba.country) as billing_country,
       COALESCE(
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_name', oi.product_name,
             'job_name', oi.job_name,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price,
             'total_price', oi.total_price,
             'discount_amount', COALESCE(oi.discount_amount, 0),
             'image_url', COALESCE(oi.image_url, p.image_url),
             'width_inches', oi.width_inches,
             'height_inches', oi.height_inches,
             'customer_artwork_url', oi.customer_artwork_url,
             'selected_modifiers', oi.selected_modifiers,
             'modifier_total', oi.modifier_total,
             'base_unit_price', oi.base_unit_price,
             'selection_mode', oi.selection_mode,
             'graphic_scenario_enabled', oi.graphic_scenario_enabled,
             'purchase_option_key', oi.purchase_option_key,
             'purchase_option_label', oi.purchase_option_label,
             'status', oi.status,
            'refund_amount', oi.refund_amount,
             'product_graphic_scenario_enabled', p.graphic_scenario_enabled
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
       LEFT JOIN addresses ba ON o.billing_address_id = ba.id
       WHERE o.id = $1 AND o.user_id = $2
       GROUP BY o.id`,
  ORDER_BY_ID_PUBLIC: `SELECT o.*,
      MAX(sa.street_address) as shipping_street_address,
      MAX(sa.address_line2) as shipping_address_line2,
      MAX(sa.city) as shipping_city,
      MAX(sa.state) as shipping_state,
      MAX(sa.postcode) as shipping_postcode,
      MAX(sa.country) as shipping_country,
      MAX(ba.street_address) as billing_street_address,
      MAX(ba.address_line2) as billing_address_line2,
      MAX(ba.city) as billing_city,
      MAX(ba.state) as billing_state,
      MAX(ba.postcode) as billing_postcode,
      MAX(ba.country) as billing_country,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'job_name', oi.job_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'discount_amount', COALESCE(oi.discount_amount, 0),
            'image_url', COALESCE(oi.image_url, p.image_url),
            'width_inches', oi.width_inches,
            'height_inches', oi.height_inches,
            'customer_artwork_url', oi.customer_artwork_url,
            'selected_modifiers', oi.selected_modifiers,
            'modifier_total', oi.modifier_total,
            'base_unit_price', oi.base_unit_price,
            'selection_mode', oi.selection_mode,
            'graphic_scenario_enabled', oi.graphic_scenario_enabled,
            'purchase_option_key', oi.purchase_option_key,
            'purchase_option_label', oi.purchase_option_label,
            'status', oi.status,
            'refund_amount', oi.refund_amount,
            'product_graphic_scenario_enabled', p.graphic_scenario_enabled
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.id
      WHERE o.id = $1
      GROUP BY o.id`,
  ALL_ORDERS_ADMIN_WITH_STATUS: `SELECT o.*, 
      COALESCE(u.email, o.guest_checkout->>'email') as user_email,
      COALESCE(u.full_name, o.guest_checkout->>'fullName') as user_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'discount_amount', COALESCE(oi.discount_amount, 0),
            'product_image', COALESCE(oi.image_url, p.image_url),
            'width_inches', oi.width_inches,
            'height_inches', oi.height_inches,
            'customer_artwork_url', oi.customer_artwork_url,
            'selected_modifiers', oi.selected_modifiers,
            'modifier_total', oi.modifier_total,
            'base_unit_price', oi.base_unit_price,
            'selection_mode', oi.selection_mode,
            'graphic_scenario_enabled', oi.graphic_scenario_enabled,
            'purchase_option_key', oi.purchase_option_key,
            'purchase_option_label', oi.purchase_option_label,
            'status', oi.status,
            'refund_amount', oi.refund_amount,
            'product_graphic_scenario_enabled', p.graphic_scenario_enabled
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE 1=1 AND o.status = $1
      GROUP BY o.id, u.email, u.full_name, o.guest_checkout ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
  ALL_ORDERS_ADMIN: `SELECT o.*, 
      COALESCE(u.email, o.guest_checkout->>'email') as user_email,
      COALESCE(u.full_name, o.guest_checkout->>'fullName') as user_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'discount_amount', COALESCE(oi.discount_amount, 0),
            'product_image', COALESCE(oi.image_url, p.image_url),
            'width_inches', oi.width_inches,
            'height_inches', oi.height_inches,
            'customer_artwork_url', oi.customer_artwork_url,
            'selected_modifiers', oi.selected_modifiers,
            'modifier_total', oi.modifier_total,
            'base_unit_price', oi.base_unit_price,
            'selection_mode', oi.selection_mode,
            'graphic_scenario_enabled', oi.graphic_scenario_enabled,
            'purchase_option_key', oi.purchase_option_key,
            'purchase_option_label', oi.purchase_option_label,
            'status', oi.status,
            'refund_amount', oi.refund_amount,
            'product_graphic_scenario_enabled', p.graphic_scenario_enabled
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE 1=1
      GROUP BY o.id, u.email, u.full_name, o.guest_checkout ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
  ORDER_ADMIN_DETAIL_WITH_JOB: `SELECT o.*, 
       u.email as user_email,
       u.full_name as user_name,
       MAX(sa.street_address) as shipping_street_address,
       MAX(sa.address_line2) as shipping_address_line2,
       MAX(sa.city) as shipping_city,
       MAX(sa.state) as shipping_state,
       MAX(sa.postcode) as shipping_postcode,
       MAX(sa.country) as shipping_country,
       MAX(ba.street_address) as billing_street_address,
       MAX(ba.address_line2) as billing_address_line2,
       MAX(ba.city) as billing_city,
       MAX(ba.state) as billing_state,
       MAX(ba.postcode) as billing_postcode,
       MAX(ba.country) as billing_country,
       COALESCE(
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_name', oi.product_name,
             'job_name', oi.job_name,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price,
             'total_price', oi.total_price,
             'discount_amount', COALESCE(oi.discount_amount, 0),
             'product_image', COALESCE(oi.image_url, p.image_url),
             'product_material', p.material,
             'product_description', p.description,
             'product_price_per_sqft', p.price_per_sqft,
             'product_min_charge', p.min_charge,
             'product_category', c.name,
             'product_subcategory', p.subcategory,
             'product_sku', p.sku,
             'width_inches', oi.width_inches,
             'height_inches', oi.height_inches,
             'customer_artwork_url', oi.customer_artwork_url,
             'selected_modifiers', oi.selected_modifiers,
             'modifier_total', oi.modifier_total,
             'base_unit_price', oi.base_unit_price,
             'selection_mode', oi.selection_mode,
             'graphic_scenario_enabled', oi.graphic_scenario_enabled,
             'purchase_option_key', oi.purchase_option_key,
             'purchase_option_label', oi.purchase_option_label,
             'status', oi.status,
            'refund_amount', oi.refund_amount,
             'product_graphic_scenario_enabled', p.graphic_scenario_enabled
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
       LEFT JOIN addresses ba ON o.billing_address_id = ba.id
       WHERE o.id = $1
       GROUP BY o.id, u.email, u.full_name`,
  ORDER_ADMIN_DETAIL_NO_JOB: `SELECT o.*, 
       u.email as user_email,
       u.full_name as user_name,
       MAX(sa.street_address) as shipping_street_address,
       MAX(sa.address_line2) as shipping_address_line2,
       MAX(sa.city) as shipping_city,
       MAX(sa.state) as shipping_state,
       MAX(sa.postcode) as shipping_postcode,
       MAX(sa.country) as shipping_country,
       MAX(ba.street_address) as billing_street_address,
       MAX(ba.address_line2) as billing_address_line2,
       MAX(ba.city) as billing_city,
       MAX(ba.state) as billing_state,
       MAX(ba.postcode) as billing_postcode,
       MAX(ba.country) as billing_country,
       COALESCE(
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_name', oi.product_name,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price,
             'total_price', oi.total_price,
             'discount_amount', COALESCE(oi.discount_amount, 0),
             'product_image', COALESCE(oi.image_url, p.image_url),
             'product_material', p.material,
             'product_description', p.description,
             'product_price_per_sqft', p.price_per_sqft,
             'product_min_charge', p.min_charge,
             'product_category', c.name,
             'product_subcategory', p.subcategory,
             'product_sku', p.sku,
             'width_inches', oi.width_inches,
             'height_inches', oi.height_inches,
             'customer_artwork_url', oi.customer_artwork_url,
             'selected_modifiers', oi.selected_modifiers,
             'modifier_total', oi.modifier_total,
             'base_unit_price', oi.base_unit_price,
             'selection_mode', oi.selection_mode,
             'graphic_scenario_enabled', oi.graphic_scenario_enabled,
             'purchase_option_key', oi.purchase_option_key,
             'purchase_option_label', oi.purchase_option_label,
             'status', oi.status,
            'refund_amount', oi.refund_amount,
             'product_graphic_scenario_enabled', p.graphic_scenario_enabled
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
       LEFT JOIN addresses ba ON o.billing_address_id = ba.id
       WHERE o.id = $1
       GROUP BY o.id, u.email, u.full_name`,
  UPDATE_ORDER_STATUS: `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
  UPDATE_ORDER_ITEM_STATUS: `UPDATE order_items
       SET status = $1
       WHERE id = $2 AND order_id = $3
       RETURNING id, order_id, status`,
  ADVANCE_ORDER_ITEM_TO_PROCESSING_IF_AWAITING: `UPDATE order_items
       SET status = 'processing'
       WHERE id = $1
         AND order_id = $2
         AND lower(trim(COALESCE(status, ''))) = 'awaiting_artwork'
       RETURNING id, order_id, status`,
  UPDATE_ORDER_TRACKING_ID: `UPDATE orders
       SET order_tracking_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
  DELETE_ORDER: 'DELETE FROM orders WHERE id = $1 RETURNING id',
  PRODUCT_EXISTS: 'SELECT id FROM products WHERE id = $1',
  INSERT_ORDER_ADMIN_CART: `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
  INSERT_ORDER_ITEM_ADMIN_WITH_JOB: `INSERT INTO order_items (order_id, product_id, product_name, job_name, quantity, unit_price, total_price, image_url, width_inches, height_inches, selected_modifiers, selection_mode, graphic_scenario_enabled, modifier_total, base_unit_price, purchase_option_key, purchase_option_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17)`,
  INSERT_ORDER_ITEM_ADMIN_NO_JOB: `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price, image_url, width_inches, height_inches, selected_modifiers, selection_mode, graphic_scenario_enabled, modifier_total, base_unit_price, purchase_option_key, purchase_option_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16)`,
  SELECT_ORDER_BY_ID: `SELECT o.* FROM orders o WHERE o.id = $1`,
  INSERT_ORDER_STRIPE_PENDING: `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, payment_status, notes, guest_checkout, guest_tracking_token_hash, guest_tracking_token_cipher, guest_tracking_token_created_at, shipping_address_id, billing_address_id, shipping_method, shipping_charge, shipping_mode, store_pickup_address_id, subtotal_amount, tax_id, tax_name, tax_percentage, tax_amount, carrier, carrier_service_type, shipping_estimated_delivery, coupon_id, coupon_code, coupon_discount_amount, coupon_discount_type, coupon_discount_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
         RETURNING id, order_number`,
  UPDATE_ORDER_FEDEX_SHIPMENT_CREATED: `UPDATE orders
       SET fedex_shipment_id = $2,
           shipping_label_url = $3,
           order_tracking_id = $4,
           status = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
  UPDATE_ORDER_SHIPMENT_TRACKING: `UPDATE orders
       SET shipment_status = $2,
           shipment_last_event = $3::jsonb,
           shipment_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
  UPDATE_ORDER_CARRIER_SERVICE_TYPE: `UPDATE orders
       SET carrier_service_type = $2,
           carrier = 'fedex',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
  // Guarded so the client-side confirm and the Stripe webhook cannot both apply the paid
  // transition; only the caller that actually changes the row gets a returned id and emails.
  UPDATE_ORDER_STRIPE_PAID: `UPDATE orders SET payment_status = $1, status = $2, notes = COALESCE(notes, '') || ' | Paid via Stripe ' || $3
       WHERE id = $4 AND COALESCE(payment_status, '') <> $1
       RETURNING id`,
  UPDATE_ORDER_PAID_WITHOUT_STRIPE: `UPDATE orders SET payment_status = $1, status = $2, payment_method = $3, notes = COALESCE(notes, '') || $4 WHERE id = $5`,
  UPDATE_CUSTOMER_ARTWORK_ON_ORDER_ITEM: `UPDATE order_items oi
    SET customer_artwork_url = $4
    FROM orders o
    WHERE oi.id = $1
      AND oi.order_id = $2
      AND o.id = oi.order_id
      AND o.user_id = $3
      AND lower(trim(COALESCE(o.status, ''))) IN ('awaiting_artwork', 'awaiting_customer_approval', 'on_hold', 'processing')
    RETURNING oi.id, oi.customer_artwork_url, oi.order_id`,
  SELECT_ORDER_ITEM_FOR_CUSTOMER_ARTWORK: `SELECT
    oi.id,
    oi.order_id,
    oi.customer_artwork_url,
    oi.width_inches,
    oi.height_inches,
    oi.selection_mode,
    oi.graphic_scenario_enabled,
    p.graphic_scenario_enabled AS product_graphic_scenario_enabled
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = $1
      AND oi.order_id = $2
      AND o.user_id = $3
      AND lower(trim(COALESCE(o.status, ''))) IN ('awaiting_artwork', 'awaiting_customer_approval', 'on_hold', 'processing')`,
  /** Guest / token flow: line belongs to order; caller must verify tracking token first. */
  SELECT_ORDER_ITEM_ARTWORK_LINE_FOR_ORDER: `SELECT
    oi.id,
    oi.order_id,
    oi.customer_artwork_url,
    oi.width_inches,
    oi.height_inches,
    oi.selection_mode,
    oi.graphic_scenario_enabled,
    p.graphic_scenario_enabled AS product_graphic_scenario_enabled
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = $1
      AND oi.order_id = $2
      AND lower(trim(COALESCE(o.status, ''))) IN ('awaiting_artwork', 'awaiting_customer_approval', 'on_hold', 'processing')`,
  UPDATE_CUSTOMER_ARTWORK_ON_ORDER_ITEM_BY_ORDER: `UPDATE order_items oi
    SET customer_artwork_url = $3
    FROM orders o
    WHERE oi.id = $1
      AND oi.order_id = $2
      AND o.id = oi.order_id
      AND lower(trim(COALESCE(o.status, ''))) IN ('awaiting_artwork', 'awaiting_customer_approval', 'on_hold', 'processing')
    RETURNING oi.id, oi.customer_artwork_url, oi.order_id`,
  UPDATE_ORDER_REFUNDED: `UPDATE orders
      SET status = $1,
          payment_status = $2,
          stripe_refund_id = $3,
          refund_amount = COALESCE(refund_amount, 0) + $4,
          refunded_at = $5,
          refund_currency = $6,
          refund_reason = $7,
          updated_at = CURRENT_TIMESTAMP,
          notes = COALESCE(notes, '') || $8
      WHERE id = $9
      RETURNING *`,
  SELECT_ORDER_ITEM_BY_ID: `SELECT * FROM order_items WHERE id = $1 AND order_id = $2`,
  SELECT_ORDER_ITEMS_BY_ORDER: `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
  UPDATE_ORDER_ITEM_REFUNDED: `UPDATE order_items
      SET status = 'refunded',
          stripe_refund_id = $1,
          refund_amount = $2,
          refunded_at = $3,
          refund_currency = $4,
          refund_reason = $5
      WHERE id = $6 AND order_id = $7
      RETURNING *`,
  UPDATE_ORDER_AFTER_ITEM_REFUND: `UPDATE orders
      SET refund_amount = COALESCE(refund_amount, 0) + $1,
          refund_currency = COALESCE($2, refund_currency),
          updated_at = CURRENT_TIMESTAMP,
          notes = COALESCE(notes, '') || $3
      WHERE id = $4
      RETURNING *`,
  UPDATE_ORDER_STRIPE_PAYMENT_INTENT: `UPDATE orders
      SET stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $1),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
  // Deliberately narrow: only columns guaranteed to exist, so a customer notification is
  // never lost to schema drift in the wider admin detail queries.
  ORDER_NOTIFICATION_CONTEXT: `SELECT o.*,
      COALESCE(u.email, o.guest_checkout->>'email') as user_email,
      COALESCE(u.full_name, o.guest_checkout->>'fullName') as user_name,
      MAX(sa.street_address) as shipping_street_address,
      MAX(sa.address_line2) as shipping_address_line2,
      MAX(sa.city) as shipping_city,
      MAX(sa.state) as shipping_state,
      MAX(sa.postcode) as shipping_postcode,
      MAX(sa.country) as shipping_country,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'job_name', oi.job_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'discount_amount', COALESCE(oi.discount_amount, 0)
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      WHERE o.id = $1
      GROUP BY o.id, u.email, u.full_name`,
};

function itemImageUrlFromBody(item) {
  return item.image_url || item.product_image || item.productImage || null;
}

/**
 * @param {object} params
 * @param {number|null} params.userId
 * @param {string} params.orderNumber
 * @param {number} params.totalAmount
 * @param {number|null} params.shippingAddressId
 * @param {number|null} params.billingAddressId
 * @param {string} params.paymentMethod
 * @param {string} [params.notes]
 * @param {object|null} params.guestCheckout
 * @param {Array} params.items - raw body items with product_id, product_name, job_name, quantity, unit_price
 */
async function createOrderWithItems({
  userId,
  orderNumber,
  totalAmount,
  shippingAddressId,
  billingAddressId,
  paymentMethod,
  notes,
  guestCheckout,
  items,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(SQL.INSERT_ORDER_FULL, [
      userId,
      orderNumber,
      totalAmount,
      shippingAddressId,
      billingAddressId,
      paymentMethod,
      notes,
      guestCheckout,
      'awaiting_artwork',
    ]);
    const order = orderResult.rows[0];
    for (const item of items) {
      const qty = parseInt(item.quantity, 10) || 1;
      const unit = parseFloat(item.unit_price) || 0;
      const lineTotal =
        item.total_price != null && item.total_price !== ''
          ? parseFloat(item.total_price)
          : unit * qty;
      await client.query(SQL.INSERT_ORDER_ITEM_WITH_JOB, [
        order.id,
        item.product_id,
        item.product_name,
        item.job_name || item.jobName || null,
        qty,
        item.unit_price,
        lineTotal,
        itemImageUrlFromBody(item),
        item.width_inches ?? null,
        item.height_inches ?? null,
        JSON.stringify(item.selected_modifiers ?? item.selectedModifiers ?? []),
        item.selection_mode ?? item.selectionMode ?? null,
        item.graphic_scenario_enabled === true || item.graphicScenarioEnabled === true,
        item.modifier_total ?? item.modifierTotal ?? 0,
        item.base_unit_price ?? item.baseUnitPrice ?? item.unit_price ?? unit,
        item.purchase_option_key ?? item.purchaseOptionKey ?? null,
        item.purchase_option_label ?? item.purchaseOptionLabel ?? null,
        item.discount_amount ?? item.discountAmount ?? 0,
      ]);
    }
    await client.query('COMMIT');
    const completeOrder = await pool.query(SQL.SELECT_ORDER_WITH_ITEMS_AGG, [order.id]);
    return completeOrder.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {number} userId
 * @param {{ status?: string, page?: number, limit?: number }} opts
 */
function normalizeUserOrderRows(rows) {
  return rows.map((order) => {
    const o = { ...order };
    if (!o.items || !Array.isArray(o.items)) {
      o.items = [];
    } else {
      o.items = o.items.filter((item) => item && item.id !== null);
    }
    return o;
  });
}

async function findOrdersForUser(userId, opts = {}) {
  const page = Number(opts.page) || 1;
  const limit = Number(opts.limit) || 20;
  const offset = (page - 1) * limit;
  if (opts.status) {
    const result = await pool.query(SQL.ORDERS_FOR_USER_WITH_STATUS, [
      userId,
      opts.status,
      limit,
      offset,
    ]);
    return normalizeUserOrderRows(result.rows);
  }
  const result = await pool.query(SQL.ORDERS_FOR_USER, [userId, limit, offset]);
  return normalizeUserOrderRows(result.rows);
}

/**
 * @returns {Promise<object|null>}
 */
async function findOrderByIdAndUserId(orderId, userId) {
  const result = await pool.query(SQL.ORDER_BY_ID_AND_USER, [orderId, userId]);
  const row = result.rows[0];
  if (!row) return null;
  const [normalized] = normalizeUserOrderRows([row]);
  return normalized;
}

async function findOrderById(orderId) {
  const result = await pool.query(SQL.ORDER_BY_ID_PUBLIC, [orderId]);
  const row = result.rows[0];
  if (!row) return null;
  const [normalized] = normalizeUserOrderRows([row]);
  return normalized;
}

/**
 * @param {{ status?: string, page?: number, limit?: number }} opts
 */
async function findAllOrdersAdmin(opts = {}) {
  const page = Number(opts.page) || 1;
  const limit = Number(opts.limit) || 1000;
  const offset = (page - 1) * limit;
  let result;
  if (opts.status) {
    result = await pool.query(SQL.ALL_ORDERS_ADMIN_WITH_STATUS, [opts.status, limit, offset]);
  } else {
    result = await pool.query(SQL.ALL_ORDERS_ADMIN, [limit, offset]);
  }
  return normalizeUserOrderRows(result.rows);
}

/**
 * @returns {Promise<object|null>}
 */
async function findOrderByIdAdmin(orderId) {
  let result;
  try {
    result = await pool.query(SQL.ORDER_ADMIN_DETAIL_WITH_JOB, [orderId]);
  } catch (err) {
    if (err.message && err.message.includes('job_name')) {
      result = await pool.query(SQL.ORDER_ADMIN_DETAIL_NO_JOB, [orderId]);
    } else {
      throw err;
    }
  }
  if (result.rows.length === 0) return null;
  const order = result.rows[0];
  if (!order.items || !Array.isArray(order.items)) {
    order.items = [];
  } else {
    order.items = order.items.filter((item) => item && item.id !== null);
    order.items.forEach((item) => {
      if (item && item.job_name === undefined) item.job_name = item.product_name || null;
    });
  }
  order.id = parseInt(order.id, 10);
  return order;
}

/**
 * @returns {Promise<object|null>}
 */
/**
 * Order plus recipient email and a minimal item list, for transactional emails.
 * @returns {Promise<object|null>}
 */
async function findOrderForNotification(orderId) {
  const id = parseInt(String(orderId), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const result = await pool.query(SQL.ORDER_NOTIFICATION_CONTEXT, [id]);
  const order = result.rows[0] ?? null;
  if (!order) return null;
  if (!Array.isArray(order.items)) order.items = [];
  order.id = parseInt(order.id, 10);
  return order;
}

async function updateOrderStatusById(orderId, statusLower) {
  const result = await pool.query(SQL.UPDATE_ORDER_STATUS, [statusLower, orderId]);
  return result.rows[0] ?? null;
}

/**
 * Admin: set status for a single order line (independent of order.status).
 * @returns {Promise<{ id: number, order_id: number, status: string }|null>}
 */
async function updateOrderItemStatusById(orderId, itemId, statusLower) {
  const result = await pool.query(SQL.UPDATE_ORDER_ITEM_STATUS, [statusLower, itemId, orderId]);
  return result.rows[0] ?? null;
}

function normalizeStatusKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

const ITEM_INACTIVE_STATUSES = new Set([
  'cancellation_requested',
  'awaiting_refund',
  'refunded',
  'cancelled',
  'canceled',
]);

const ITEM_CANCEL_ALLOWED_STATUSES = new Set(['awaiting_artwork', 'on_hold', 'processing']);

const WHOLE_ORDER_CANCEL_FLOW_STATUSES = new Set([
  'cancellation_requested',
  'awaiting_refund',
  'refunded',
  'cancelled',
  'canceled',
]);

function isInactiveOrderItemStatus(status) {
  return ITEM_INACTIVE_STATUSES.has(normalizeStatusKey(status));
}

function isWholeOrderCancelFlowStatus(status) {
  return WHOLE_ORDER_CANCEL_FLOW_STATUSES.has(normalizeStatusKey(status));
}

async function findOrderItemById(orderId, itemId) {
  const result = await pool.query(SQL.SELECT_ORDER_ITEM_BY_ID, [itemId, orderId]);
  return result.rows[0] ?? null;
}

async function listOrderItemsByOrderId(orderId) {
  const result = await pool.query(SQL.SELECT_ORDER_ITEMS_BY_ORDER, [orderId]);
  return result.rows;
}

/**
 * Customer/guest: request cancellation of one line. Does not change order.status.
 * @returns {Promise<{ item: object, order: object }>}
 */
async function requestOrderItemCancellation(orderId, itemId) {
  const order = await findOrderById(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }
  if (isWholeOrderCancelFlowStatus(order.status)) {
    const err = new Error('This order is already in the cancellation or refund flow.');
    err.statusCode = 400;
    throw err;
  }

  const items = await listOrderItemsByOrderId(orderId);
  const item = items.find((row) => Number(row.id) === Number(itemId));
  if (!item) {
    const err = new Error('Order item not found');
    err.statusCode = 404;
    throw err;
  }

  const itemStatus = normalizeStatusKey(item.status);
  if (itemStatus === 'cancellation_requested') {
    const err = new Error('Cancellation already requested for this item.');
    err.statusCode = 409;
    throw err;
  }
  if (!ITEM_CANCEL_ALLOWED_STATUSES.has(itemStatus)) {
    const err = new Error('This item cannot be cancelled at its current stage.');
    err.statusCode = 400;
    throw err;
  }

  const activeCount = items.filter((row) => !isInactiveOrderItemStatus(row.status)).length;
  if (activeCount <= 1) {
    const err = new Error('Use order cancellation when only one item remains.');
    err.statusCode = 400;
    throw err;
  }

  const updatedItem = await updateOrderItemStatusById(orderId, itemId, 'cancellation_requested');
  return { item: updatedItem, order };
}

/**
 * After a successful Stripe partial refund for one line: mark item refunded and
 * record the refund on the order. Original subtotal/tax/shipping/total stay as charged.
 */
async function markOrderItemRefunded({
  orderId,
  itemId,
  refundId,
  refundAmount,
  refundedAtIso,
  refundCurrency,
  refundReason,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query(SQL.UPDATE_ORDER_ITEM_REFUNDED, [
      refundId,
      refundAmount,
      refundedAtIso,
      refundCurrency || 'usd',
      refundReason || null,
      itemId,
      orderId,
    ]);
    const item = itemResult.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return null;
    }

    const suffix = ` | Item ${itemId} refunded via Stripe ${refundId} (${refundAmount} ${String(
      refundCurrency || 'usd'
    ).toUpperCase()}) ${refundedAtIso}`;

    await client.query(SQL.UPDATE_ORDER_AFTER_ITEM_REFUND, [
      refundAmount,
      refundCurrency || 'usd',
      suffix,
      orderId,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return findOrderByIdAdmin(orderId);
}

/**
 * After customer artwork upload: if line is still awaiting_artwork, move it to processing.
 * Does not change other item statuses or the parent order status.
 * @returns {Promise<{ id: number, order_id: number, status: string }|null>}
 */
async function maybeAdvanceOrderItemToProcessingAfterArtwork(orderId, itemId) {
  const id = parseInt(String(orderId), 10);
  const lineId = parseInt(String(itemId), 10);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(lineId) || lineId <= 0) return null;
  const result = await pool.query(SQL.ADVANCE_ORDER_ITEM_TO_PROCESSING_IF_AWAITING, [lineId, id]);
  return result.rows[0] ?? null;
}

/**
 * @param {string|number} orderId
 * @param {string|null} trackingId
 * @returns {Promise<object|null>}
 */
async function updateOrderTrackingIdById(orderId, trackingId) {
  const result = await pool.query(SQL.UPDATE_ORDER_TRACKING_ID, [trackingId, orderId]);
  return result.rows[0] ?? null;
}

async function updateOrderAfterFedexShipmentCreated(orderId, payload) {
  const {
    fedexShipmentId,
    shippingLabelUrl,
    trackingNumber,
    orderStatus = 'shipped',
  } = payload || {};
  const result = await pool.query(SQL.UPDATE_ORDER_FEDEX_SHIPMENT_CREATED, [
    orderId,
    fedexShipmentId ?? null,
    shippingLabelUrl ?? null,
    trackingNumber ?? null,
    orderStatus,
  ]);
  return result.rows[0] ?? null;
}

async function updateOrderShipmentTracking(orderId, payload) {
  const { shipmentStatus, shipmentLastEvent } = payload || {};
  const result = await pool.query(SQL.UPDATE_ORDER_SHIPMENT_TRACKING, [
    orderId,
    shipmentStatus ?? null,
    shipmentLastEvent != null ? JSON.stringify(shipmentLastEvent) : null,
  ]);
  return result.rows[0] ?? null;
}

async function updateOrderCarrierServiceType(orderId, carrierServiceType) {
  const svc = String(carrierServiceType || '').trim().toUpperCase();
  const result = await pool.query(SQL.UPDATE_ORDER_CARRIER_SERVICE_TYPE, [
    orderId,
    svc || null,
  ]);
  return result.rows[0] ?? null;
}

/**
 * @returns {Promise<number|null>} deleted id or null
 */
async function deleteOrderById(orderId) {
  const result = await pool.query(SQL.DELETE_ORDER, [orderId]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * @returns {Promise<boolean>}
 */
async function productExists(productId) {
  const r = await pool.query(SQL.PRODUCT_EXISTS, [productId]);
  return r.rows.length > 0;
}

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/**
 * @param {object} client - pg pool client
 * @param {boolean} useJobName
 * @param {{ userId: any, totalAmount: number, orderStatus: string, productId: any, productName: string, itemImageUrl: any }} baseParams
 * @param {Array<{ jobName: string, quantity: number, unitPrice: number, totalPrice: number }>} lines
 */
async function insertAdminCartOrderAndItems(client, useJobName, baseParams, lines) {
  const { userId, totalAmount, orderStatus, productId, productName, itemImageUrl } = baseParams;
  const ordNum = generateOrderNumber();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(SQL.INSERT_ORDER_ADMIN_CART, [
      userId,
      ordNum,
      totalAmount,
      orderStatus,
      'admin_cart',
      'Created from cart by admin',
    ]);
    const order = orderResult.rows[0];
    for (const line of lines) {
      if (useJobName) {
        await client.query(SQL.INSERT_ORDER_ITEM_ADMIN_WITH_JOB, [
          order.id,
          productId,
          productName,
          line.jobName,
          line.quantity,
          line.unitPrice,
          line.totalPrice,
          itemImageUrl,
          line.width_inches ?? null,
          line.height_inches ?? null,
          JSON.stringify(line.selected_modifiers ?? line.selectedModifiers ?? []),
          line.selection_mode ?? line.selectionMode ?? null,
          line.graphic_scenario_enabled === true || line.graphicScenarioEnabled === true,
          line.modifier_total ?? line.modifierTotal ?? 0,
          line.base_unit_price ?? line.baseUnitPrice ?? line.unitPrice ?? 0,
          line.purchase_option_key ?? line.purchaseOptionKey ?? null,
          line.purchase_option_label ?? line.purchaseOptionLabel ?? null,
        ]);
      } else {
        await client.query(SQL.INSERT_ORDER_ITEM_ADMIN_NO_JOB, [
          order.id,
          productId,
          productName,
          line.quantity,
          line.unitPrice,
          line.totalPrice,
          itemImageUrl,
          line.width_inches ?? null,
          line.height_inches ?? null,
          JSON.stringify(line.selected_modifiers ?? line.selectedModifiers ?? []),
          line.selection_mode ?? line.selectionMode ?? null,
          line.graphic_scenario_enabled === true || line.graphicScenarioEnabled === true,
          line.modifier_total ?? line.modifierTotal ?? 0,
          line.base_unit_price ?? line.baseUnitPrice ?? line.unitPrice ?? 0,
          line.purchase_option_key ?? line.purchaseOptionKey ?? null,
          line.purchase_option_label ?? line.purchaseOptionLabel ?? null,
        ]);
      }
    }
    await client.query('COMMIT');
    return order;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function insertAdminCartOrderAndItem(client, useJobName, params) {
  const {
    userId,
    totalAmount,
    orderStatus,
    productId,
    productName,
    jobName,
    quantity,
    unitPrice,
    totalPrice,
    itemImageUrl,
  } = params;
  return insertAdminCartOrderAndItems(
    client,
    useJobName,
    {
      userId,
      totalAmount,
      orderStatus,
      productId,
      productName,
      itemImageUrl,
    },
    [
      {
        jobName,
        quantity,
        unitPrice,
        totalPrice,
        width_inches: params.width_inches ?? null,
        height_inches: params.height_inches ?? null,
      },
    ]
  );
}

/**
 * @returns {Promise<object>} order row (minimal)
 */
async function createOrderFromCartItemAdmin(params) {
  const client = await pool.connect();
  try {
    let order;
    try {
      order = await insertAdminCartOrderAndItem(client, true, params);
    } catch (firstErr) {
      const isJobNameError =
        firstErr.message &&
        (firstErr.message.includes('job_name') ||
          firstErr.message.includes('current transaction is aborted'));
      if (isJobNameError) {
        order = await insertAdminCartOrderAndItem(client, false, params);
      } else {
        throw firstErr;
      }
    }
    const fullOrder = await pool.query(SQL.SELECT_ORDER_BY_ID, [order.id]);
    return fullOrder.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Admin order from one cart row that contains multiple print jobs (same size, different artwork/qty).
 * @param {{ userId: any, totalAmount: number, orderStatus: string, productId: any, productName: string, itemImageUrl: any, lines: Array<{ jobName: string, quantity: number, unitPrice: number, totalPrice: number }> }} params
 */
async function createOrderFromCartItemAdminMultiJob(params) {
  const { lines, ...baseSingle } = params;
  const baseParams = {
    userId: baseSingle.userId,
    totalAmount: baseSingle.totalAmount,
    orderStatus: baseSingle.orderStatus,
    productId: baseSingle.productId,
    productName: baseSingle.productName,
    itemImageUrl: baseSingle.itemImageUrl,
  };
  const client = await pool.connect();
  try {
    let order;
    try {
      order = await insertAdminCartOrderAndItems(client, true, baseParams, lines);
    } catch (firstErr) {
      const isJobNameError =
        firstErr.message &&
        (firstErr.message.includes('job_name') ||
          firstErr.message.includes('current transaction is aborted'));
      if (isJobNameError) {
        order = await insertAdminCartOrderAndItems(client, false, baseParams, lines);
      } else {
        throw firstErr;
      }
    }
    const fullOrder = await pool.query(SQL.SELECT_ORDER_BY_ID, [order.id]);
    return fullOrder.rows[0];
  } finally {
    client.release();
  }
}

async function verifyAddressBelongsToUser(userId, addressId) {
  if (userId == null || addressId == null) return false;
  const r = await pool.query('SELECT id FROM addresses WHERE id = $1 AND user_id = $2', [
    addressId,
    userId,
  ]);
  return r.rows.length > 0;
}

async function getOrderUserId(orderId) {
  const r = await pool.query('SELECT user_id FROM orders WHERE id = $1', [orderId]);
  return r.rows[0]?.user_id ?? null;
}

async function verifyStorePickupAddressExists(addressId) {
  if (addressId == null) return false;
  const r = await pool.query(
    'SELECT id FROM store_pickup_addresses WHERE id = $1 AND is_active = true',
    [addressId]
  );
  return r.rows.length > 0;
}

/**
 * @param {object} params
 * @param {number|null} params.userId
 * @param {string} params.orderNumber
 * @param {number} params.totalAmount
 * @param {object|null} params.guestCheckout
 * @param {Array<{product_id, product_name, job_name, quantity, unit_price, total_price, image_url}>} params.orderItems
 * @returns {Promise<{ orderId: number, orderNumber: string }>}
 */
async function createPendingStripeOrderWithItems({
  userId,
  orderNumber,
  totalAmount,
  guestCheckout,
  guestTrackingTokenHash = null,
  guestTrackingTokenCipher = null,
  orderItems,
  shippingAddressId = null,
  billingAddressId = null,
  shippingMethod = null,
  shippingCharge = 0,
  shippingMode = 'blind_drop_ship',
  storePickupAddressId = null,
  subtotalAmount = 0,
  tax = null,
  carrier = null,
  carrierServiceType = null,
  shippingEstimatedDelivery = null,
  couponId = null,
  couponCode = null,
  couponDiscountAmount = 0,
  couponDiscountType = null,
  couponDiscountValue = null,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(SQL.INSERT_ORDER_STRIPE_PENDING, [
      userId,
      orderNumber,
      totalAmount,
      'pending_payment',
      'stripe',
      'pending',
      'Checkout via Stripe',
      guestCheckout,
      guestTrackingTokenHash,
      guestTrackingTokenCipher,
      guestTrackingTokenHash ? new Date().toISOString() : null,
      shippingAddressId,
      billingAddressId,
      shippingMethod,
      shippingCharge,
      shippingMode,
      storePickupAddressId,
      subtotalAmount,
      tax?.id ?? null,
      tax?.name ?? null,
      tax?.percentage ?? 0,
      tax?.amount ?? 0,
      carrier,
      carrierServiceType,
      shippingEstimatedDelivery,
      couponId,
      couponCode,
      couponDiscountAmount,
      couponDiscountType,
      couponDiscountValue,
    ]);
    const order = orderResult.rows[0];
    const orderId = order.id;
    for (const oi of orderItems) {
      await client.query(SQL.INSERT_ORDER_ITEM_WITH_JOB, [
        orderId,
        oi.product_id,
        oi.product_name,
        oi.job_name,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.image_url,
        oi.width_inches ?? null,
        oi.height_inches ?? null,
        JSON.stringify(oi.selected_modifiers ?? oi.selectedModifiers ?? []),
        oi.selection_mode ?? oi.selectionMode ?? null,
        oi.graphic_scenario_enabled === true || oi.graphicScenarioEnabled === true,
        oi.modifier_total ?? oi.modifierTotal ?? 0,
        oi.base_unit_price ?? oi.baseUnitPrice ?? oi.unit_price ?? 0,
        oi.purchase_option_key ?? oi.purchaseOptionKey ?? null,
        oi.purchase_option_label ?? oi.purchaseOptionLabel ?? null,
        oi.discount_amount ?? oi.discountAmount ?? 0,
      ]);
    }
    await client.query('COMMIT');
    return { orderId, orderNumber: order.order_number };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function findGuestOrderByIdAndTokenHash(orderId, tokenHash) {
  if (!tokenHash) return null;
  const order = await findOrderById(orderId);
  if (!order) return null;
  const currentHash = String(order.guest_tracking_token_hash || '');
  if (!currentHash || currentHash !== String(tokenHash)) return null;
  return order;
}

/**
 * @returns {Promise<boolean>} true only when this call performed the paid transition, so
 * the caller knows whether it owns the confirmation email.
 */
async function markOrderPaidFromStripe(orderId, paidAtIso, paymentIntentId = null) {
  const result = await pool.query(SQL.UPDATE_ORDER_STRIPE_PAID, [
    'paid',
    'awaiting_artwork',
    paidAtIso,
    orderId,
  ]);
  if (paymentIntentId) {
    await pool.query(SQL.UPDATE_ORDER_STRIPE_PAYMENT_INTENT, [String(paymentIntentId), orderId]);
  }
  return result.rowCount > 0;
}

async function setOrderStripePaymentIntent(orderId, paymentIntentId) {
  if (!paymentIntentId) return;
  await pool.query(SQL.UPDATE_ORDER_STRIPE_PAYMENT_INTENT, [String(paymentIntentId), orderId]);
}

async function markOrderPaidWithoutStripe(orderId) {
  const suffix = ` | Completed without Stripe (STRIPE_PAYMENT_ENABLED=false) ${new Date().toISOString()}`;
  await pool.query(SQL.UPDATE_ORDER_PAID_WITHOUT_STRIPE, ['paid', 'awaiting_artwork', 'manual', suffix, orderId]);
}

/**
 * @param {number|string} orderId
 * @param {number|string} itemId
 * @param {number} userId
 * @param {string} artworkUrl
 * @returns {Promise<{ id: number, customer_artwork_url: string, order_id: number }|null>}
 */
async function updateCustomerArtworkForOrderItem(orderId, itemId, userId, artworkUrl) {
  const r = await pool.query(SQL.UPDATE_CUSTOMER_ARTWORK_ON_ORDER_ITEM, [
    itemId,
    orderId,
    userId,
    artworkUrl,
  ]);
  return r.rows[0] ?? null;
}

/**
 * @returns {Promise<{ id: number, order_id: number, width_inches: number|null, height_inches: number|null }|null>}
 */
async function selectOrderItemForCustomerArtwork(orderId, itemId, userId) {
  const r = await pool.query(SQL.SELECT_ORDER_ITEM_FOR_CUSTOMER_ARTWORK, [itemId, orderId, userId]);
  return r.rows[0] ?? null;
}

/**
 * @returns {Promise<{ id: number, order_id: number, width_inches: number|null, height_inches: number|null }|null>}
 */
async function selectOrderItemArtworkLineForOrder(orderId, itemId) {
  const r = await pool.query(SQL.SELECT_ORDER_ITEM_ARTWORK_LINE_FOR_ORDER, [itemId, orderId]);
  return r.rows[0] ?? null;
}

/**
 * @returns {Promise<{ id: number, customer_artwork_url: string, order_id: number }|null>}
 */
async function updateCustomerArtworkForOrderItemByOrderId(orderId, itemId, artworkUrl) {
  const r = await pool.query(SQL.UPDATE_CUSTOMER_ARTWORK_ON_ORDER_ITEM_BY_ORDER, [itemId, orderId, artworkUrl]);
  return r.rows[0] ?? null;
}

/**
 * True when every order line has a non-empty customer_artwork_url.
 * @param {number|string} orderId
 * @returns {Promise<boolean>}
 */
async function allOrderLinesHaveCustomerArtwork(orderId) {
  const id = parseInt(String(orderId), 10);
  if (!Number.isFinite(id) || id <= 0) return false;
  const totalR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM order_items WHERE order_id = $1`,
    [id]
  );
  const total = totalR.rows[0]?.c ?? 0;
  if (total === 0) return false;
  const missingR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM order_items
     WHERE order_id = $1
       AND (customer_artwork_url IS NULL OR TRIM(COALESCE(customer_artwork_url, '')) = '')`,
    [id]
  );
  const missing = missingR.rows[0]?.c ?? 0;
  return missing === 0;
}

/**
 * When every line has artwork and order is still in artwork-waiting phase, set status to processing.
 * @param {number|string} orderId
 * @returns {Promise<object|null>} updated order row if status changed
 */
async function maybeAdvanceOrderToProcessingAfterArtwork(orderId) {
  const id = parseInt(String(orderId), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const hasAll = await allOrderLinesHaveCustomerArtwork(id);
  if (!hasAll) return null;
  const order = await findOrderById(id);
  if (!order) return null;
  const st = String(order.status || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  if (st === 'processing') {
    /** Already processing — all artwork is present, signal the frontend to redirect. */
    return { status: 'processing' };
  }
  if (st !== 'awaiting_artwork' && st !== 'awaiting_customer_approval') {
    return null;
  }
  return updateOrderStatusById(id, 'processing');
}

async function markOrderRefunded({
  orderId,
  refundId,
  refundAmount,
  refundedAtIso,
  refundCurrency,
  refundReason,
}) {
  const suffix = ` | Refunded via Stripe ${refundId} (${refundAmount} ${String(
    refundCurrency || 'usd'
  ).toUpperCase()}) ${refundedAtIso}`;
  const result = await pool.query(SQL.UPDATE_ORDER_REFUNDED, [
    'refunded',
    'refunded',
    refundId,
    refundAmount,
    refundedAtIso,
    refundCurrency || 'usd',
    refundReason || null,
    suffix,
    orderId,
  ]);
  return result.rows[0] ?? null;
}

module.exports = {
  createOrderWithItems,
  findOrdersForUser,
  findOrderByIdAndUserId,
  findOrderById,
  findGuestOrderByIdAndTokenHash,
  findAllOrdersAdmin,
  findOrderByIdAdmin,
  findOrderForNotification,
  updateOrderStatusById,
  updateOrderItemStatusById,
  findOrderItemById,
  requestOrderItemCancellation,
  markOrderItemRefunded,
  maybeAdvanceOrderItemToProcessingAfterArtwork,
  updateOrderTrackingIdById,
  updateOrderAfterFedexShipmentCreated,
  updateOrderShipmentTracking,
  updateOrderCarrierServiceType,
  deleteOrderById,
  productExists,
  createOrderFromCartItemAdmin,
  createOrderFromCartItemAdminMultiJob,
  createPendingStripeOrderWithItems,
  markOrderPaidFromStripe,
  setOrderStripePaymentIntent,
  markOrderPaidWithoutStripe,
  updateCustomerArtworkForOrderItem,
  selectOrderItemForCustomerArtwork,
  selectOrderItemArtworkLineForOrder,
  updateCustomerArtworkForOrderItemByOrderId,
  allOrderLinesHaveCustomerArtwork,
  maybeAdvanceOrderToProcessingAfterArtwork,
  markOrderRefunded,
  verifyAddressBelongsToUser,
  verifyStorePickupAddressExists,
  getOrderUserId,
};
