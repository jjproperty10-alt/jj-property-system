/**
 * S4 skeleton. Distinct contacts from public.v_contact_settlement
 * (contact_id, contact_name), read 2026-10-03.
 * Applied certifications exist for Orit Rob, Tamir, and Uriel.
 * Every other contact is no-cert. No adapter is invented.
 * `not-in-scope` is part of the status set and has no row in this list.
 */

export type AdapterRegistryStatus = 'adapter-present' | 'pending-adapter' | 'no-cert' | 'not-in-scope'

export interface AdapterRegistryEntry {
  readonly contactId: string
  readonly contactName: string
  readonly status: AdapterRegistryStatus
  /** Set only when a report adapter exists in this repo. */
  readonly clientSlug?: string
  readonly note?: string
}

export const ADAPTER_REGISTRY: readonly AdapterRegistryEntry[] = [
  { contactId: '51a3d8a9-ab9f-400c-b7a9-39b4aa907607', contactName: 'Efi', status: 'no-cert' },
  { contactId: '9d86fcb4-d842-45b0-930b-6d268e6b3c1a', contactName: 'Ilan & Ilana', status: 'no-cert' },
  { contactId: '3974a458-ac4d-4c88-94bb-a90a4ccc3057', contactName: 'Liora', status: 'no-cert' },
  { contactId: 'a990d491-8f37-4390-856e-23292917431c', contactName: 'Liron and Alon', status: 'no-cert' },
  { contactId: '14658b78-4ec8-4afc-ac42-85f59cf4442c', contactName: 'Miranta', status: 'no-cert' },
  { contactId: '7109719a-4a14-432b-803a-f17317c79ab5', contactName: 'Ofri', status: 'no-cert' },
  { contactId: '7c82adce-afa6-4bdf-9715-f463024f396a', contactName: 'Oren', status: 'no-cert' },
  {
    contactId: 'f5e9d870-ae36-43c7-b275-0a8288b5ef92',
    contactName: 'Orit Rob',
    status: 'adapter-present',
    clientSlug: 'orit-rob',
  },
  { contactId: 'cb013068-6fe5-4f64-903d-9f38f638dfb0', contactName: 'Oshrit', status: 'no-cert' },
  { contactId: 'a2e4523a-c48c-4dd7-9f79-f8edf81c2e2d', contactName: 'Roni', status: 'no-cert' },
  { contactId: 'd42c8780-6256-406f-b5a6-6d4324fe5873', contactName: 'Sharon', status: 'no-cert' },
  {
    contactId: '8cc76506-12b8-4883-9378-92f7ba7b5df9',
    contactName: 'Tamir',
    status: 'pending-adapter',
    note: 'Pending a decision on cumulative vs separate. Do not use the unapproved draft reader.',
  },
  { contactId: '7c126565-62f4-4dde-a15a-f6eb971d38eb', contactName: 'Tom', status: 'no-cert' },
  {
    contactId: '3997b50d-63af-4c6c-bdce-e5060ecfb48a',
    contactName: 'Uriel',
    status: 'adapter-present',
    clientSlug: 'uriel',
    note: 'Neer stays inside this report; that placement is pending Yossi. Garden and Sharon credit wording default to the 15:38 labels and are pending Yossi.',
  },
  { contactId: '0a22ccfe-44d6-4492-ad02-e6577f406124', contactName: 'Vard', status: 'no-cert' },
  { contactId: '4b5f6044-1b32-4d8a-99a3-12f5c32ae341', contactName: 'Yogev', status: 'no-cert' },
]
