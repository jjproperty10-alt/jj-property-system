export type Category =
  | 'Purchase'
  | 'Sale'
  | 'Renovation'
  | 'Management'
  | 'Transfer'
  | 'JJ'
  | 'Airbnb'
  | 'General'

export type PropertyStatus = 'Airbnb' | 'Rent' | 'Sale' | 'Rent&Sale' | 'Inactive'

export type UserRole =
  | 'super_admin'
  | 'partner_admin'
  | 'airbnb_manager'
  | 'rental_manager'
  | 'employee'

export interface Property {
  id: string
  name: string
  nickname: string | null
  status: PropertyStatus | null
  address: string | null
  owner_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  location_url: string | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  date: string
  property_id: string | null
  property_name: string | null
  category: Category
  subcategory: string
  description: string | null
  payer: string | null
  payee: string | null
  amount_eur: number
  client_charge: number | null
  notes: string | null
  k_note: string | null
  created_at: string
  updated_at: string
}

export interface CashPosition {
  box_name: string
  balance: number
}

export interface PropertySummary {
  id: string
  name: string
  nickname: string | null
  status: string | null
  total_purchased: number
  total_sale_received: number
  renovation_costs: number
  renovation_revenue: number
  management_income: number
  management_expenses: number
  management_fees: number
  paid_to_owner: number
  airbnb_revenue: number
  airbnb_expenses: number
  transaction_count: number
}

export interface OwnerBalance {
  property_name: string
  property_id: string | null
  total_received: number
  total_expenses: number
  management_fees: number
  paid_to_owner: number
  balance_due_to_owner: number
}

export interface RentalContract {
  id: string
  property_id: string
  tenant_name: string
  start_date: string
  end_date: string | null
  monthly_rent: number
  deposit: number
  payment_day: number | null
  management_fee_type: 'fixed' | 'percentage'
  management_fee_value: number
  status: 'active' | 'expired' | 'terminated'
  notes: string | null
}

export interface Alert {
  id: string
  type: string
  title: string
  description: string | null
  property_id: string | null
  due_date: string | null
  is_read: boolean
  created_at: string
}

// Category → Subcategories map
export const CATEGORY_SUBCATEGORIES: Record<Category, string[]> = {
  Purchase: [
    'Purchase Contract','Purchase Payment','Purchase Deposit',
    'Purchase Expenses','Purchase Tax','Purchase Lawyer','Brokerage','Other',
  ],
  Sale: [
    'Sale Contract','Client Payment','Third-Party Payment','Client Sale Expenses',
    'Sale Lawyer','Sale Tax','Broker Fee','Other',
  ],
  Renovation: [
    'Renovation Contract','Extras','Client Payment','Materials','Workers','Contractors',
    'Cleaning','Transport / Removal','Repairs','Furniture','Electrical Appliances',
    'Curtains','Design','Aluminium','Carpenter','Plumber','Other',
  ],
  Management: [
    'Tenant Payment','Tenant Bank Payment','Client Payment','Deposit','Deposit Refund',
    'Electricity','Water','Internet','HOA','Municipality Tax','Insurance',
    'Property Insurance','Repairs','Plumber','Cleaning','Furniture',
    'Electrical Appliances','Curtains','Design','Key Duplication',
    'Management Fee','Bank Payment to Owner','Other',
  ],
  Transfer: [
    'Transfer','Partner Loan','Expense Reimbursement','Cash Withdrawal','Owner Payment',
  ],
  JJ: [
    'Office Rent','Office Supplies','Office Maintenance','General Office Expenses',
    'Legal / Accountant','Salary Anastasia','Salary Fabi','Salary Employee',
    'Electricity','Water','Internet','Insurance','Marketing','Cleaning Supplies',
    'Refreshments','Airbnb Operations','Bazaraki','JJ Income',
    'Software / Hostaway','Photography','Car Expenses','Other',
  ],
  Airbnb: [
    'Platform Income','Management Fee','Design Fee','Client Payment',
    'Bank Payment to Owner','Electricity Bill','Water','Internet','HOA',
    'Pool Service','Insurance','Software / Hostaway','Consumable Supplies',
    'Guest Supplies','Bedding / Pillows / Blankets','Airbnb Equipment',
    'Kitchen Supplies','Wine','Photography','Repairs','Furniture',
    'Electrical Appliances','Design','Contractors','Municipality Tax','Other',
  ],
  General: ['General Income','Car Expenses','Flights / Travel','Phone','General Purchases',
    'General Insurance','General Fees','General Supplier Expenses','Tax Refunds / Charges','Other'],
}

export const KNOWN_PAYERS = [
  'Yossi','Jacob','JJ','Anastasia','Tenant','Client','Owner','Airbnb','ATM','Fabi',
]

export const KNOWN_PAYEES = [
  'Company','Anastasia','Jacob','JJ','Owner','Yossi','Fabi','David','Yanis',
  'German','Yasin','Savva','Dominik','Tenant','Client','Photographer',
]

export const CATEGORIES: Category[] = [
  'Purchase','Sale','Renovation','Management','Transfer','JJ','Airbnb','General',
]

export const CATEGORY_COLORS: Record<Category, string> = {
  Purchase:   'bg-blue-100 text-blue-800',
  Sale:       'bg-green-100 text-green-800',
  Renovation: 'bg-orange-100 text-orange-800',
  Management: 'bg-purple-100 text-purple-800',
  Transfer:   'bg-gray-100 text-gray-800',
  JJ:         'bg-slate-100 text-slate-800',
  Airbnb:     'bg-pink-100 text-pink-800',
  General:    'bg-yellow-100 text-yellow-800',
}
