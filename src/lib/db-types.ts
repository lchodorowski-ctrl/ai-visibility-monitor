
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "calibration_checks": {
                  Row: {
                    "calibration_id": string,"engine_id": string,"id": string,"manual_alias": string | null,"manual_mentioned": boolean | null,"manual_urls": (string)[],"project_id": string,"prompt_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calibration_id": string,"engine_id": string,"id"?: string,"manual_alias"?: string | null,"manual_mentioned"?: boolean | null,"manual_urls"?: (string)[],"project_id": string,"prompt_id": string,"updated_at"?: string
                  }
                  Update: {
                    "calibration_id"?: string,"engine_id"?: string,"id"?: string,"manual_alias"?: string | null,"manual_mentioned"?: boolean | null,"manual_urls"?: (string)[],"project_id"?: string,"prompt_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calibration_checks_calibration_id_fkey"
      columns: ["calibration_id"]
isOneToOne: false
      referencedRelation: "calibrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calibration_checks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calibration_checks_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "prompts"
      referencedColumns: ["id"]
    }
                  ]
                },"calibrations": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"created_by": string | null,"id": string,"project_id": string,"run_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id": string,"run_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"project_id"?: string,"run_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calibrations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calibrations_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"citations": {
                  Row: {
                    "competitor_id": string | null,"domain": string,"id": string,"is_own": boolean,"project_id": string,"response_id": string,"title": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "competitor_id"?: string | null,"domain": string,"id"?: string,"is_own"?: boolean,"project_id": string,"response_id": string,"title"?: string | null,"url": string
                  }
                  Update: {
                    "competitor_id"?: string | null,"domain"?: string,"id"?: string,"is_own"?: boolean,"project_id"?: string,"response_id"?: string,"title"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "citations_competitor_id_fkey"
      columns: ["competitor_id"]
isOneToOne: false
      referencedRelation: "competitors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "citations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "citations_response_id_fkey"
      columns: ["response_id"]
isOneToOne: false
      referencedRelation: "responses"
      referencedColumns: ["id"]
    }
                  ]
                },"competitors": {
                  Row: {
                    "aliases": (string)[],"domains": (string)[],"id": string,"name": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: (string)[],"domains"?: (string)[],"id"?: string,"name": string,"project_id": string
                  }
                  Update: {
                    "aliases"?: (string)[],"domains"?: (string)[],"id"?: string,"name"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitors_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_metrics": {
                  Row: {
                    "avg_position": number | null,"citation_rate": number,"computed_at": string,"date": string,"engine_id": string | null,"id": string,"project_id": string,"prompt_id": string | null,"responses_count": number,"score": number,"share_of_voice": number,"visibility_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_position"?: number | null,"citation_rate"?: number,"computed_at"?: string,"date": string,"engine_id"?: string | null,"id"?: string,"project_id": string,"prompt_id"?: string | null,"responses_count"?: number,"score"?: number,"share_of_voice"?: number,"visibility_rate"?: number
                  }
                  Update: {
                    "avg_position"?: number | null,"citation_rate"?: number,"computed_at"?: string,"date"?: string,"engine_id"?: string | null,"id"?: string,"project_id"?: string,"prompt_id"?: string | null,"responses_count"?: number,"score"?: number,"share_of_voice"?: number,"visibility_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_metrics_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_metrics_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "prompts"
      referencedColumns: ["id"]
    }
                  ]
                },"gsc_page_daily": {
                  Row: {
                    "clicks": number,"date": string,"impressions": number,"page": string,"position": number | null,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clicks": number,"date": string,"impressions": number,"page": string,"position"?: number | null,"project_id": string
                  }
                  Update: {
                    "clicks"?: number,"date"?: string,"impressions"?: number,"page"?: string,"position"?: number | null,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gsc_page_daily_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"gsc_query_daily": {
                  Row: {
                    "clicks": number,"date": string,"device": string,"impressions": number,"page": string,"position": number | null,"project_id": string,"query": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clicks": number,"date": string,"device": string,"impressions": number,"page": string,"position"?: number | null,"project_id": string,"query": string
                  }
                  Update: {
                    "clicks"?: number,"date"?: string,"device"?: string,"impressions"?: number,"page"?: string,"position"?: number | null,"project_id"?: string,"query"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gsc_query_daily_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"gsc_site_daily": {
                  Row: {
                    "clicks": number,"date": string,"impressions": number,"position": number | null,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clicks": number,"date": string,"impressions": number,"position"?: number | null,"project_id": string
                  }
                  Update: {
                    "clicks"?: number,"date"?: string,"impressions"?: number,"position"?: number | null,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gsc_site_daily_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"keyword_suggestions": {
                  Row: {
                    "competitor_positions": NonNullable<Json>,"cpc": number | null,"created_at": string,"id": string,"key": string,"keyword_difficulty": number | null,"own_position": number | null,"own_url": string | null,"project_id": string,"search_volume": number | null,"seed": string | null,"source": string,"status": string,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "competitor_positions"?: NonNullable<Json>,"cpc"?: number | null,"created_at"?: string,"id"?: string,"key": string,"keyword_difficulty"?: number | null,"own_position"?: number | null,"own_url"?: string | null,"project_id": string,"search_volume"?: number | null,"seed"?: string | null,"source": string,"status"?: string,"text": string,"updated_at"?: string
                  }
                  Update: {
                    "competitor_positions"?: NonNullable<Json>,"cpc"?: number | null,"created_at"?: string,"id"?: string,"key"?: string,"keyword_difficulty"?: number | null,"own_position"?: number | null,"own_url"?: string | null,"project_id"?: string,"search_volume"?: number | null,"seed"?: string | null,"source"?: string,"status"?: string,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "keyword_suggestions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"keywords": {
                  Row: {
                    "active": boolean,"competition": string | null,"competition_index": number | null,"cpc": number | null,"created_at": string,"id": string,"key": string,"monthly_searches": Json | null,"project_id": string,"search_volume": number | null,"source": string,"target_path": string | null,"text": string,"trend": Json | null,"trend_updated_at": string | null,"volume_updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"competition"?: string | null,"competition_index"?: number | null,"cpc"?: number | null,"created_at"?: string,"id"?: string,"key": string,"monthly_searches"?: Json | null,"project_id": string,"search_volume"?: number | null,"source": string,"target_path"?: string | null,"text": string,"trend"?: Json | null,"trend_updated_at"?: string | null,"volume_updated_at"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"competition"?: string | null,"competition_index"?: number | null,"cpc"?: number | null,"created_at"?: string,"id"?: string,"key"?: string,"monthly_searches"?: Json | null,"project_id"?: string,"search_volume"?: number | null,"source"?: string,"target_path"?: string | null,"text"?: string,"trend"?: Json | null,"trend_updated_at"?: string | null,"volume_updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "keywords_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "org_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "org_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "org_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"mentions": {
                  Row: {
                    "brand_kind": string,"brand_name": string,"char_index": number,"competitor_id": string | null,"id": string,"position": number,"project_id": string,"response_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_kind": string,"brand_name": string,"char_index": number,"competitor_id"?: string | null,"id"?: string,"position": number,"project_id": string,"response_id": string
                  }
                  Update: {
                    "brand_kind"?: string,"brand_name"?: string,"char_index"?: number,"competitor_id"?: string | null,"id"?: string,"position"?: number,"project_id"?: string,"response_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mentions_competitor_id_fkey"
      columns: ["competitor_id"]
isOneToOne: false
      referencedRelation: "competitors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mentions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mentions_response_id_fkey"
      columns: ["response_id"]
isOneToOne: false
      referencedRelation: "responses"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_engines": {
                  Row: {
                    "enabled": boolean,"engine_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"engine_id": string,"project_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"engine_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_engines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "brand_aliases": (string)[],"brand_name": string,"country": string,"created_at": string,"domains": (string)[],"facts": NonNullable<Json>,"gsc_property": string | null,"id": string,"locale": string,"low_visibility_threshold": number,"monthly_budget_usd": number,"name": string,"org_id": string,"schedule": string,"seo_budget_usd": number,"site_url": string,"trends_anchor": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_aliases"?: (string)[],"brand_name": string,"country"?: string,"created_at"?: string,"domains"?: (string)[],"facts"?: NonNullable<Json>,"gsc_property"?: string | null,"id"?: string,"locale"?: string,"low_visibility_threshold"?: number,"monthly_budget_usd"?: number,"name": string,"org_id": string,"schedule"?: string,"seo_budget_usd"?: number,"site_url"?: string,"trends_anchor"?: string | null
                  }
                  Update: {
                    "brand_aliases"?: (string)[],"brand_name"?: string,"country"?: string,"created_at"?: string,"domains"?: (string)[],"facts"?: NonNullable<Json>,"gsc_property"?: string | null,"id"?: string,"locale"?: string,"low_visibility_threshold"?: number,"monthly_budget_usd"?: number,"name"?: string,"org_id"?: string,"schedule"?: string,"seo_budget_usd"?: number,"site_url"?: string,"trends_anchor"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"prompts": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"intent": string,"is_key": boolean,"project_id": string,"text": string,"topic_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"intent"?: string,"is_key"?: boolean,"project_id": string,"text": string,"topic_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"intent"?: string,"is_key"?: boolean,"project_id"?: string,"text"?: string,"topic_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prompts_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prompts_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendations": {
                  Row: {
                    "action_steps": NonNullable<Json>,"created_at": string,"effort": number,"evidence": NonNullable<Json>,"fingerprint": string,"id": string,"impact": number,"priority": number | null,"project_id": string,"prompt_id": string | null,"rationale": string | null,"run_id": string | null,"status": string,"suggested_outline": Json | null,"summary": string,"target_url": string | null,"title": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_steps"?: NonNullable<Json>,"created_at"?: string,"effort": number,"evidence"?: NonNullable<Json>,"fingerprint": string,"id"?: string,"impact": number,"priority"?: never,"project_id": string,"prompt_id"?: string | null,"rationale"?: string | null,"run_id"?: string | null,"status"?: string,"suggested_outline"?: Json | null,"summary": string,"target_url"?: string | null,"title": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "action_steps"?: NonNullable<Json>,"created_at"?: string,"effort"?: number,"evidence"?: NonNullable<Json>,"fingerprint"?: string,"id"?: string,"impact"?: number,"priority"?: never,"project_id"?: string,"prompt_id"?: string | null,"rationale"?: string | null,"run_id"?: string | null,"status"?: string,"suggested_outline"?: Json | null,"summary"?: string,"target_url"?: string | null,"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recommendations_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendations_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "prompts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendations_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"responses": {
                  Row: {
                    "citations": NonNullable<Json>,"cost_usd": number,"created_at": string,"engine_id": string,"error": string | null,"id": string,"model": string | null,"no_answer": boolean,"project_id": string,"prompt_id": string,"raw": Json | null,"run_id": string,"sample_idx": number,"sentiment": string | null,"sentiment_summary": string | null,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "citations"?: NonNullable<Json>,"cost_usd"?: number,"created_at"?: string,"engine_id": string,"error"?: string | null,"id"?: string,"model"?: string | null,"no_answer"?: boolean,"project_id": string,"prompt_id": string,"raw"?: Json | null,"run_id": string,"sample_idx"?: number,"sentiment"?: string | null,"sentiment_summary"?: string | null,"text"?: string
                  }
                  Update: {
                    "citations"?: NonNullable<Json>,"cost_usd"?: number,"created_at"?: string,"engine_id"?: string,"error"?: string | null,"id"?: string,"model"?: string | null,"no_answer"?: boolean,"project_id"?: string,"prompt_id"?: string,"raw"?: Json | null,"run_id"?: string,"sample_idx"?: number,"sentiment"?: string | null,"sentiment_summary"?: string | null,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "responses_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "responses_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "prompts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "responses_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"runs": {
                  Row: {
                    "cost_usd": number,"error": string | null,"finished_at": string | null,"id": string,"project_id": string,"queries_failed": number,"queries_total": number,"recommendations_cost_usd": number,"stage": string,"started_at": string,"status": string,"trigger_source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"project_id": string,"queries_failed"?: number,"queries_total"?: number,"recommendations_cost_usd"?: number,"stage"?: string,"started_at"?: string,"status"?: string,"trigger_source"?: string
                  }
                  Update: {
                    "cost_usd"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"project_id"?: string,"queries_failed"?: number,"queries_total"?: number,"recommendations_cost_usd"?: number,"stage"?: string,"started_at"?: string,"status"?: string,"trigger_source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "runs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"seo_jobs": {
                  Row: {
                    "cost_usd": number,"error": string | null,"finished_at": string | null,"id": string,"kind": string,"project_id": string,"started_at": string,"stats": NonNullable<Json>,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"kind": string,"project_id": string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string
                  }
                  Update: {
                    "cost_usd"?: number,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"kind"?: string,"project_id"?: string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seo_jobs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"site_pages": {
                  Row: {
                    "description": string | null,"excerpt": string | null,"fetched_at": string,"h1": string | null,"id": string,"path": string,"project_id": string,"status": number,"title": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"h1"?: string | null,"id"?: string,"path": string,"project_id": string,"status"?: number,"title"?: string | null,"url": string
                  }
                  Update: {
                    "description"?: string | null,"excerpt"?: string | null,"fetched_at"?: string,"h1"?: string | null,"id"?: string,"path"?: string,"project_id"?: string,"status"?: number,"title"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_pages_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"topics": {
                  Row: {
                    "id": string,"name": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"project_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topics_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "gsc_query_pages":
{ Args: { "p_from": string,"p_min_impressions": number,"p_project": string,"p_to": string }; Returns: {
              "clicks": number,"impressions": number,"page": string,"position": number,"query": string
            }[]
                           },
"gsc_query_windows":
{ Args: { "p_cur_from": string,"p_cur_to": string,"p_limit": number,"p_prev_from": string,"p_prev_to": string,"p_project": string }; Returns: {
              "cur_clicks": number,"cur_impressions": number,"cur_position": number,"prev_clicks": number,"prev_impressions": number,"prev_position": number,"query": string
            }[]
                           },
"gsc_top_pages":
{ Args: { "p_from": string,"p_limit": number,"p_project": string,"p_to": string }; Returns: {
              "clicks": number,"impressions": number,"page": string,"position": number
            }[]
                           },
"gsc_totals":
{ Args: { "p_from": string,"p_project": string,"p_to": string }; Returns: {
              "clicks": number,"impressions": number,"position": number
            }[]
                           },
"is_org_member":
{ Args: { "org": string }; Returns: boolean
                           },
"project_org":
{ Args: { "p": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
