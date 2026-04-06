ALTER TABLE thoughts ADD COLUMN in_response_to_id UUID REFERENCES thoughts(id) ON DELETE SET NULL;
CREATE INDEX thoughts_in_response_to_idx ON thoughts(in_response_to_id) WHERE in_response_to_id IS NOT NULL;
