const pool = require('../config/database');

const MODIFIER_GROUPS = [
  { name: '# of Sides', key: 'sides', sort_order: 0 },
  { name: 'Pole Pocket', key: 'pole_pocket', sort_order: 1 },
  { name: 'Hem', key: 'hem', sort_order: 2 },
  { name: 'Grommet', key: 'grommet', sort_order: 3 },
  { name: 'Webbing', key: 'webbing', sort_order: 4 },
  { name: 'Rope', key: 'rope', sort_order: 5 },
  { name: 'Windslit', key: 'windslit', sort_order: 6 },
  { name: 'Corners', key: 'corners', sort_order: 7 },
];

const MODIFIER_OPTIONS = {
  sides: [
    { label: '1 Side', value: '', price_adjustment: 0, is_default: true },
    { label: '2 Sides', value: '', price_adjustment: 5, is_default: false },
  ],
  pole_pocket: [
    { label: '2"', value: 'Top Bottom', price_adjustment: 4, is_default: false },
    { label: '3"', value: 'Top Bottom', price_adjustment: 5, is_default: false },
    { label: '4"', value: 'Top Bottom', price_adjustment: 5, is_default: false },
    { label: '2"', value: 'Top Only', price_adjustment: 5, is_default: false },
    { label: '3"', value: 'Top Only', price_adjustment: 5, is_default: false },
    { label: '4"', value: 'Top Only', price_adjustment: 5, is_default: false },
  ],
  hem: [
    { label: 'All Sides', value: '', price_adjustment: 5, is_default: true },
    { label: 'No Hem', value: '', price_adjustment: 0, is_default: false },
  ],
  grommet: [
    { label: "Every 2'", value: 'All Sides', price_adjustment: 5, is_default: true },
    { label: "Every 2'", value: 'Top Bottom', price_adjustment: 3, is_default: false },
    { label: "Every 2'", value: 'Left & Right', price_adjustment: 7, is_default: false },
    { label: '4 Corner Only', value: '', price_adjustment: 5, is_default: false }
  ],
  webbing: [
    { label: '1"', value: 'Webbing', price_adjustment: 5, is_default: false },
    { label: '1"', value: 'w/ D-rings', price_adjustment: 5, is_default: false },
    { label: '1"', value: 'Velcro - All Sides', price_adjustment: 5, is_default: false },
  ],
  rope: [
    { label: '3/16"', value: 'Top Only', price_adjustment: 5, is_default: false },
    { label: '3/16"', value: 'Bottom Only', price_adjustment: 5, is_default: false },
    { label: '3/16"', value: 'Top Bottom', price_adjustment: 5, is_default: false },
    { label: '5/16"', value: 'Top Only', price_adjustment: 5, is_default: false },
    { label: '5/16"', value: 'Bottom Only', price_adjustment: 5, is_default: false },
    { label: '5/16"', value: 'Top Bottom', price_adjustment: 5, is_default: false },
  ],
  windslit: [
    { label: 'No Windslits', value: '', price_adjustment: 5, is_default: true },
    { label: 'Standard Windslits', value: '', price_adjustment: 5, is_default: false },
  ],
  corners: [
    { label: 'Reinforce Top Only', value: '', price_adjustment: 5, is_default: false },
    { label: 'Reinforce Bottom Only', value: '', price_adjustment: 5, is_default: false },
    { label: 'Reinforce All Corners', value: '', price_adjustment: 5, is_default: false },
  ],
};

async function seedModifiers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupIdsByKey = {};
    for (const group of MODIFIER_GROUPS) {
      const result = await client.query(
        `INSERT INTO modifier_groups (name, key, input_type, sort_order, is_active)
         VALUES ($1, $2, 'dropdown', $3, true)
         ON CONFLICT (key)
         DO UPDATE SET
           name = EXCLUDED.name,
           input_type = EXCLUDED.input_type,
           sort_order = EXCLUDED.sort_order,
           is_active = true,
           updated_at = NOW()
         RETURNING id`,
        [group.name, group.key, group.sort_order]
      );
      groupIdsByKey[group.key] = Number(result.rows[0].id);
    }

    await client.query(
      `DELETE FROM modifier_options
       WHERE modifier_group_id = ANY($1::int[])`,
      [Object.values(groupIdsByKey)]
    );

    for (const group of MODIFIER_GROUPS) {
      const groupId = groupIdsByKey[group.key];
      const options = MODIFIER_OPTIONS[group.key] || [];
      for (let i = 0; i < options.length; i += 1) {
        const option = options[i];
        await client.query(
          `INSERT INTO modifier_options (
             modifier_group_id,
             label,
             value,
             price_adjustment,
             price_type,
             is_default,
             sort_order,
             is_active
           ) VALUES ($1, $2, $3, $4, 'fixed', $5, $6, true)`,
          [groupId, option.label, option.value, Number(option.price_adjustment || 0), !!option.is_default, i]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Modifier seed completed: 8 groups with options created.');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Modifier seed failed:', error.message || error);
    process.exit(1);
  } finally {
    client.release();
  }
}

seedModifiers();
