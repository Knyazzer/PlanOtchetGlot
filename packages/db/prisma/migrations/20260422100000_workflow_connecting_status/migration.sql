-- Add 'connecting' value to StatusRowStatus enum for Workflow stage
ALTER TYPE "StatusRowStatus" ADD VALUE IF NOT EXISTS 'connecting';
