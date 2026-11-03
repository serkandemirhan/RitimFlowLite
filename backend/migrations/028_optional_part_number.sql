-- An unnumbered customer part is represented by NULL, without inventing a code.
ALTER TABLE orders ALTER COLUMN part_number DROP NOT NULL;
