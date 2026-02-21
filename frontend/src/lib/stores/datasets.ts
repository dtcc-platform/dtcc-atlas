import { writable } from 'svelte/store'
import type { DatasetInfo } from '../types'
import type { FormConfig } from '../types/form-fields'

export const datasets = writable<DatasetInfo[]>([])
export const selectedDataset = writable<DatasetInfo | null>(null)
export const formConfig = writable<FormConfig | null>(null)
