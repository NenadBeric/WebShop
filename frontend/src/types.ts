export type Product = {
  id: number;
  tenant_id: string;
  name: string;
  description: string;
  product_type_id: number;
  product_type_name: string;
  measure_unit_id: number;
  measure_unit_name: string;
  quantity: string;
  vat_rate_percent: string;
  price_net: string;
  price_gross: string;
  sale_percent: number;
  price_net_effective: string;
  price_gross_effective: string;
  image_url: string;
  available: boolean;
  replacement_product_ids: number[];
};

export type TenantStaffRow = {
  id: number;
  tenant_id: string;
  email: string;
  display_name: string;
  role: string;
  active: boolean;
};

export type OrderStaffEvent = {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_sub: string | null;
  actor_email: string;
  actor_name: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type OrderLineOut = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: string;
  unit_price_net: string;
  vat_rate_percent: string;
  note: string;
  product_available_now: boolean;
  substituted_from_product_id: number | null;
  /** Snimak akcije u trenutku prodaje (0 = bez popusta na stavci). */
  sale_percent_applied?: number;
  /** Redovna kataloška cena po jedinici (pre popusta) u trenutku porudžbine. */
  catalog_unit_price_gross: string;
  catalog_unit_price_net: string;
};

export type OrderDetail = {
  id: number;
  order_number: string;
  status: string;
  total: string;
  pickup_mode: string;
  pickup_at: string | null;
  pickup_note: string;
  pickup_location_id: number | null;
  rejection_reason: string | null;
  client_email: string;
  client_first_name: string;
  client_last_name: string;
  preferred_lang: string;
  qr_data_url: string;
  lines: OrderLineOut[];
  pending_substitutions: {
    id: number;
    line_id: number;
    offered_product_ids: number[];
    offered_products?: { id: number; name: string }[];
  }[];
  pending_quantity_reductions: {
    id: number;
    line_id: number;
    previous_quantity: number;
    proposed_quantity: number;
    product_name: string;
  }[];
  resolved_substitutions?: {
    id: number;
    line_id: number;
    status: string;
    offered_product_ids: number[];
    offered_products?: { id: number; name: string }[];
    selected_product_id?: number;
    selected_product_name?: string;
  }[];
  resolved_quantity_reductions?: {
    id: number;
    line_id: number;
    status: string;
    previous_quantity: number;
    proposed_quantity: number;
    product_name: string;
  }[];
  source_code: string;
  staff_events?: OrderStaffEvent[];
  /** Kad je true, recepcijska uloga i dalje vidi kupčev tok (sopstvena porudžbina). */
  is_my_order?: boolean;
  /** Recepcija: kupac je odbio poslednji predlog na nekoj stavci — „Odobri celu“ je onemogućeno dok se stavka ne ukloni / novi predlog. */
  approve_blocked_by_customer_rejection?: boolean;
};

export type OrderListItem = {
  id: number;
  order_number: string;
  status: string;
  total: string;
  total_net: string;
  total_vat: string;
  created_at: string;
  client_email: string;
  client_first_name: string;
  client_last_name: string;
  pickup_mode: string;
  pickup_at: string | null;
  pickup_location_id?: number | null;
  pickup_location_name?: string;
};

export type AppNotification = {
  id: number;
  order_id: number;
  order_number: string;
  event_type: string;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type ShopReportKpis = {
  orders_total: number;
  orders_open: number;
  orders_ready_or_picked: number;
  orders_rejected_or_expired: number;
  revenue_settled: string;
  revenue_pipeline: string;
};

export type ShopReportDiscount = {
  revenue_gross_from_discounted_lines: string;
  units_sold_on_discounted_lines: number;
  order_line_rows_on_sale: number;
  catalog_products_with_active_sale: number;
};

export type ShopReport = {
  date_from: string;
  date_to: string;
  kpis: ShopReportKpis;
  by_status: { status: string; count: number }[];
  by_day: { day: string; orders: number; revenue_gross: string }[];
  top_products: {
    product_id: number;
    product_name: string;
    quantity_sold: number;
    revenue_gross: string;
    quantity_sold_on_sale: number;
    revenue_gross_on_sale: string;
  }[];
  by_source: { source_code: string; orders: number; revenue_gross: string }[];
  discount: ShopReportDiscount;
};

export type TenantLocationOut = {
  id: number;
  code: string;
  name: string;
  address_line: string;
  sort_order: number;
  is_active: boolean;
};

export type ReceptionDeskOut = {
  location_id: number | null;
  locations: TenantLocationOut[];
};

export type SessionOut = {
  sub: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
};

export type TenantProfileOut = {
  tenant_id: string;
  legal_name: string;
  trade_name: string;
  pib: string;
  mb: string;
  address_line: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  contact_email: string;
  website: string;
  timezone: string;
  terms_note: string;
  max_schedule_days_ahead: number;
  min_notice_hours_before_pickup: number;
  pickup_grace_hours_after_slot: number;
  locations: TenantLocationOut[];
  telegram_chat_id: string;
  telegram_bot_token_set: boolean;
  telegram_notify_new_order: boolean;
  notify_before_pickup_minutes: number;
  day_reminder_hour_local: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_from: string;
  smtp_use_tls: boolean;
  smtp_password_set: boolean;
};

export type AiCatalogSearchHit = {
  product_id: number;
  name: string;
  reason: string;
};

export type AiCatalogSearchOut = {
  hits: AiCatalogSearchHit[];
};

export type StaffChatSessionRow = {
  id: number;
  title: string;
  last_activity_at: string | null;
  message_count: number;
};

export type StaffChatMessageRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sent_at: string | null;
};

export type TenantLocationInForm = {
  code: string;
  name: string;
  address_line: string;
  sort_order: number;
  is_active: boolean;
};

export type TenantOrderRules = {
  max_schedule_days_ahead: number;
  min_notice_hours_before_pickup: number;
  pickup_grace_hours_after_slot: number;
  timezone: string;
  locations: TenantLocationOut[];
};
