/**
 * @module home/homeTypes
 * @description Home module type re-exports.
 *
 * PR #79: HomeScreenState replaced by HomeBriefDTO.
 * All Home types now live in homeBriefTypes.ts.
 * This file re-exports for barrel convenience.
 */

export type { HomeBriefDTO, HomeBriefAttentionItem } from './homeBriefTypes'
