const pool = require('../config/database');

const NORMALIZED_STATUS = `replace(lower(trim(COALESCE(o.status, ''))), ' ', '_')`;

/** Order totals included in dashboard "Total revenue" (completed pipeline only). */
const COMPLETED_FOR_REVENUE = `${NORMALIZED_STATUS} IN ('completed', 'complete', 'delivered')`;

const PAID_OR_COMPLETED_CLAUSE = `
  (
    COALESCE(o.payment_status, '') = 'paid'
    OR ${NORMALIZED_STATUS} IN ('printing', 'trimming', 'shipped', 'completed')
  )
`;

const SUMMARY_QUERY = `
  SELECT
    (
      SELECT COUNT(*)::int
      FROM users u
      WHERE COALESCE(lower(trim(u.role)), 'customer') = 'customer'
    ) AS registered_users_count,
    COUNT(*)::int AS total_orders,
    COALESCE(SUM(CASE WHEN ${COMPLETED_FOR_REVENUE} THEN o.total_amount ELSE 0 END), 0)::numeric AS total_revenue,
    COUNT(*) FILTER (WHERE ${COMPLETED_FOR_REVENUE})::int AS revenue_completed_order_count,
    COUNT(*) FILTER (
      WHERE ${NORMALIZED_STATUS} NOT IN ('completed', 'refunded')
    )::int AS pending_orders,
    COUNT(*) FILTER (
      WHERE ${NORMALIZED_STATUS} IN ('cancellation_requested', 'awaiting_refund', 'refunded')
    )::int AS refund_orders,
    COUNT(*) FILTER (WHERE ${NORMALIZED_STATUS} = 'completed')::int AS completed_orders,
    COALESCE(SUM(CASE WHEN ${NORMALIZED_STATUS} = 'refunded' THEN COALESCE(o.refund_amount, 0) ELSE 0 END), 0)::numeric AS refund_amount,
    COUNT(*) FILTER (
      WHERE o.user_id IS NOT NULL AND ${NORMALIZED_STATUS} = 'completed'
    )::int AS registered_completed_orders,
    COUNT(*) FILTER (
      WHERE o.user_id IS NOT NULL AND ${NORMALIZED_STATUS} NOT IN ('completed', 'refunded')
    )::int AS registered_in_progress_orders,
    COUNT(*) FILTER (
      WHERE o.user_id IS NULL AND ${NORMALIZED_STATUS} = 'completed'
    )::int AS guest_completed_orders,
    COUNT(*) FILTER (
      WHERE o.user_id IS NULL AND ${NORMALIZED_STATUS} NOT IN ('completed', 'refunded')
    )::int AS guest_in_progress_orders
  FROM orders o
  WHERE o.created_at >= $1
    AND o.created_at <= $2
`;

const REVENUE_BY_MONTH_FOR_YEAR_QUERY = `
  SELECT
    EXTRACT(MONTH FROM o.created_at)::int AS month_no,
    COALESCE(SUM(o.total_amount), 0)::numeric AS revenue
  FROM orders o
  WHERE EXTRACT(YEAR FROM o.created_at)::int = $1
    AND ${PAID_OR_COMPLETED_CLAUSE}
  GROUP BY EXTRACT(MONTH FROM o.created_at)
  ORDER BY month_no ASC
`;

const REVENUE_AVAILABLE_YEARS_QUERY = `
  SELECT DISTINCT EXTRACT(YEAR FROM o.created_at)::int AS year_value
  FROM orders o
  WHERE ${PAID_OR_COMPLETED_CLAUSE}
  ORDER BY year_value DESC
`;

const ORDERS_OVERVIEW_QUERY = `
  SELECT
    COUNT(*) FILTER (
      WHERE ${NORMALIZED_STATUS} IN (
        'pending_payment',
        'awaiting_artwork',
        'cancellation_requested',
        'on_hold',
        'awaiting_customer_approval'
      )
    )::int AS pending,
    COUNT(*) FILTER (WHERE ${NORMALIZED_STATUS} IN ('printing', 'trimming', 'reprint'))::int AS processing,
    COUNT(*) FILTER (WHERE ${NORMALIZED_STATUS} = 'shipped')::int AS shipped,
    COUNT(*) FILTER (WHERE ${NORMALIZED_STATUS} = 'completed')::int AS completed
  FROM orders o
`;

const ORDER_STATUS_BREAKDOWN_QUERY = `
  SELECT
    ${NORMALIZED_STATUS} AS status_key,
    COUNT(*)::int AS count_value
  FROM orders o
  GROUP BY ${NORMALIZED_STATUS}
`;

const TOP_PRODUCTS_QUERY = `
  SELECT
    oi.product_id::text AS product_id,
    COALESCE(NULLIF(TRIM(oi.product_name), ''), 'Unnamed product') AS product_name,
    COALESCE(SUM(oi.quantity), 0)::int AS order_count,
    COALESCE(SUM(oi.total_price), 0)::numeric AS revenue
  FROM order_items oi
  INNER JOIN orders o ON o.id = oi.order_id
  WHERE o.created_at >= $1
    AND o.created_at <= $2
    AND ${PAID_OR_COMPLETED_CLAUSE}
  GROUP BY oi.product_id, COALESCE(NULLIF(TRIM(oi.product_name), ''), 'Unnamed product')
  ORDER BY revenue DESC, order_count DESC
  LIMIT $3
`;

const RECENT_ORDERS_QUERY = `
  SELECT
    o.id,
    o.order_number,
    COALESCE(u.full_name, o.guest_checkout->>'fullName', 'Guest') AS customer_name,
    o.total_amount,
    o.status,
    o.created_at
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id
  WHERE o.created_at >= $1
    AND o.created_at <= $2
  ORDER BY o.created_at DESC
  LIMIT $3
`;

async function getAdminDashboardData({ fromIso, toIso, chartYear, topLimit, recentLimit }) {
  const [summaryResult, revenueByMonthResult, availableYearsResult, overviewResult, statusBreakdownResult, topProductsResult, recentOrdersResult] =
    await Promise.all([
      pool.query(SUMMARY_QUERY, [fromIso, toIso]),
      pool.query(REVENUE_BY_MONTH_FOR_YEAR_QUERY, [chartYear]),
      pool.query(REVENUE_AVAILABLE_YEARS_QUERY),
      pool.query(ORDERS_OVERVIEW_QUERY),
      pool.query(ORDER_STATUS_BREAKDOWN_QUERY),
      pool.query(TOP_PRODUCTS_QUERY, [fromIso, toIso, topLimit]),
      pool.query(RECENT_ORDERS_QUERY, [fromIso, toIso, recentLimit]),
    ]);

  const summary = summaryResult.rows[0] || {};
  const totalRevenue = Number(summary.total_revenue || 0);
  const revenueCompletedOrderCount = Number(summary.revenue_completed_order_count || 0);
  const averageOrderValue =
    revenueCompletedOrderCount > 0 ? totalRevenue / revenueCompletedOrderCount : 0;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const revenueByMonthMap = new Map(
    revenueByMonthResult.rows.map((row) => [Number(row.month_no), Number(row.revenue || 0)])
  );
  const yearlySeries = monthNames.map((name, idx) => ({
    bucket: name,
    revenue: revenueByMonthMap.get(idx + 1) || 0,
  }));
  const availableYears = availableYearsResult.rows
    .map((row) => Number(row.year_value))
    .filter((y) => Number.isFinite(y));

  const statusBreakdown = statusBreakdownResult.rows.map((row) => ({
    status: String(row.status_key || ''),
    count: Number(row.count_value || 0),
  }));

  return {
    summary: {
      registeredUsersCount: Number(summary.registered_users_count || 0),
      totalRevenue,
      totalOrders: Number(summary.total_orders || 0),
      averageOrderValue,
      pendingOrders: Number(summary.pending_orders || 0),
      refundOrders: Number(summary.refund_orders || 0),
      completedOrders: Number(summary.completed_orders || 0),
      refundAmount: Number(summary.refund_amount || 0),
      registeredCompletedOrders: Number(summary.registered_completed_orders || 0),
      registeredInProgressOrders: Number(summary.registered_in_progress_orders || 0),
      guestCompletedOrders: Number(summary.guest_completed_orders || 0),
      guestInProgressOrders: Number(summary.guest_in_progress_orders || 0),
    },
    revenueChart: {
      year: chartYear,
      availableYears,
      series: yearlySeries,
    },
    ordersOverview: {
      pending: Number(overviewResult.rows[0]?.pending || 0),
      processing: Number(overviewResult.rows[0]?.processing || 0),
      shipped: Number(overviewResult.rows[0]?.shipped || 0),
      completed: Number(overviewResult.rows[0]?.completed || 0),
      statusBreakdown,
    },
    topProducts: topProductsResult.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      orderCount: Number(row.order_count || 0),
      revenue: Number(row.revenue || 0),
    })),
    recentOrders: recentOrdersResult.rows.map((row) => ({
      orderId: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name || 'Guest',
      totalAmount: Number(row.total_amount || 0),
      status: row.status,
      date: row.created_at,
    })),
  };
}

module.exports = {
  getAdminDashboardData,
};
