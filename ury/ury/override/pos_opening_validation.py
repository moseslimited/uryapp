# Copyright (c) 2025, URY contributors
# POS Opening Entry validation disabled for restaurant POS (no outdated / missing / multiple checks).


def validate_opening_entry_no_outdated_check(pos_profile):
	"""
	No-op: do not block POS Invoice / Sales Invoice (POS) on opening entry state.
	Removes "Outdated POS Opening Entry", missing entry, and multiple-entry errors for Pay / sync.
	"""
	return
