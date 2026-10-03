<header class="dashboard-header">
	<div class="brand" aria-label="Company logo placeholder">
		<span class="logo-placeholder" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none">
				<path d="m12 3 9 5-9 5-9-5 9-5Z" />
				<path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
			</svg>
		</span>
		<span>Company logo</span>
	</div>

	<div class="student" aria-label="Student information placeholder">
		<div class="student-details">
			<span class="student-name">Student name</span>
			<span class="student-description">Student information</span>
		</div>
		<span class="avatar-placeholder" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="8" r="3" />
				<path d="M5 20v-2a7 7 0 0 1 14 0v2" />
			</svg>
		</span>
	</div>
</header>

<style>
	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		min-height: 5.5rem;
		padding: 1rem 2rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.brand,
	.student {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.brand {
		font-size: 1rem;
		font-weight: 650;
		letter-spacing: -0.025em;
	}

	.logo-placeholder,
	.avatar-placeholder {
		display: grid;
		flex-shrink: 0;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
	}

	.logo-placeholder {
		border-radius: 0.75rem;
		background: var(--color-accent-soft);
		color: var(--color-accent);
	}

	.avatar-placeholder {
		border: 1px solid var(--color-border);
		border-radius: 50%;
		background: var(--color-background);
		color: var(--color-muted);
	}

	svg {
		width: 1.4rem;
		height: 1.4rem;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.student-details {
		display: grid;
		gap: 0.15rem;
		text-align: right;
	}

	.student-name {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.student-description {
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	@media (max-width: 40rem) {
		.dashboard-header {
			gap: 1rem;
			padding: 1rem;
		}

		.brand {
			gap: 0.5rem;
			font-size: 0.875rem;
		}

		.student {
			gap: 0.5rem;
		}

		.avatar-placeholder {
			display: none;
		}
	}
</style>
