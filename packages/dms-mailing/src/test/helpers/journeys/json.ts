/** A value JSON carries: what a journey sends as a request body. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };
