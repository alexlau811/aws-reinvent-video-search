import { vi } from 'vitest'
import '@testing-library/jest-dom'

// Mock browser APIs for testing
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

Object.defineProperty(window, 'indexedDB', {
  value: undefined,
  writable: true,
})

// Mock fetch globally
global.fetch = vi.fn()

// Mock btoa and atob for base64 encoding
global.btoa = vi.fn((str: string) => Buffer.from(str, 'binary').toString('base64'))
global.atob = vi.fn((str: string) => Buffer.from(str, 'base64').toString('binary'))