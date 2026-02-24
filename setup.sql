    'ticket_number', v_next_number,
    'company_id', v_co_id,
    'customer_phone', v_phone,
    'customer_name', (p_payload->>'customer_name')::TEXT,
    'status', v_status,
    'queue_position', v_initial_pos,
    'estimated_minutes', v_est_mins,
    'payment_method', p_payload->>'payment_method',
    'payment_proof_url', p_payload->>'payment_proof_url',
    'created_at', v_created_at
  ) INTO v_result;

  RETURN v_result;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.p_entry_queue TO anon, authenticated;

-- 4. FINAL CACHE RELOAD
COMMENT ON SCHEMA public IS 'KwikFood API Schema Refreshed';
NOTIFY pgrst, 'reload schema';
