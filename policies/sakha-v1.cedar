// Sakha farm team. Only Sakha consults. Market math is Paisa's. Memory stays
// in the caller's namespace. Fetch domains match packages/core/src/web-research.ts.

permit(principal is Sakha::Farmer, action in [Sakha::Action::"read",Sakha::Action::"write",Sakha::Action::"record_work",Sakha::Action::"decide_plan",Sakha::Action::"save_fact"], resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed };

permit(principal is Sakha::Agent, action in [Sakha::Action::"read",Sakha::Action::"propose",Sakha::Action::"peer",Sakha::Action::"clarify"], resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed && (!resource.private || context.privateGrant) };

permit(principal is Sakha::Agent, action == Sakha::Action::"memory", resource is Sakha::Resource)
when {
  principal.farm == resource.farm
  && context.allowed
  && (!resource.private || context.privateGrant)
  && resource.namespace == principal.role
};

// Agents never record completed work, approve a plan, or save farmer facts.
forbid(principal is Sakha::Agent, action in [Sakha::Action::"record_work",Sakha::Action::"decide_plan",Sakha::Action::"save_fact"], resource is Sakha::Resource);

// No payments, form submissions, or outbound messages.
forbid(principal, action in [Sakha::Action::"payment",Sakha::Action::"submit_form",Sakha::Action::"send_message"], resource is Sakha::Resource);

// Specialists do not consult each other. Sakha is the only router.
forbid(principal is Sakha::Agent, action == Sakha::Action::"consult", resource is Sakha::Resource)
unless { principal.role == "sakha" };

forbid(principal is Sakha::Agent, action == Sakha::Action::"peer", resource is Sakha::Resource)
unless { principal.role == "sakha" };

// Mandi, scheme, and rupee scenarios belong to Paisa.
forbid(principal is Sakha::Agent, action == Sakha::Action::"market", resource is Sakha::Resource)
unless { principal.role == "paisa" };

permit(principal is Sakha::Agent, action == Sakha::Action::"market", resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed && principal.role == "paisa" };

permit(principal is Sakha::Agent, action == Sakha::Action::"write_profile", resource is Sakha::Resource)
when { principal.farm == resource.farm && context.allowed && principal.role == "sakha" };

forbid(principal is Sakha::Agent, action == Sakha::Action::"write_profile", resource is Sakha::Resource)
unless { principal.role == "sakha" };

permit(principal is Sakha::Agent, action == Sakha::Action::"web_search", resource is Sakha::Resource)
when {
  principal.farm == resource.farm
  && context.allowed
  && (principal.role == "sakha" || principal.role == "megha" || principal.role == "jal" || principal.role == "kheti" || principal.role == "paisa")
};

permit(principal is Sakha::Agent, action == Sakha::Action::"fetch_page", resource is Sakha::Resource)
when {
  principal.farm == resource.farm
  && context.allowed
  && (principal.role == "sakha" || principal.role == "megha" || principal.role == "jal" || principal.role == "kheti" || principal.role == "paisa")
  && (
    context.domain == "gov.in" || context.domain like "*.gov.in"
    || context.domain == "nic.in" || context.domain like "*.nic.in"
    || context.domain == "imd.gov.in" || context.domain like "*.imd.gov.in"
    || context.domain == "icar.org.in" || context.domain like "*.icar.org.in"
    || context.domain == "icar.gov.in" || context.domain like "*.icar.gov.in"
    || context.domain == "agricoop.nic.in" || context.domain like "*.agricoop.nic.in"
    || context.domain == "agricoop.gov.in" || context.domain like "*.agricoop.gov.in"
    || context.domain == "pib.gov.in" || context.domain like "*.pib.gov.in"
    || context.domain == "data.gov.in" || context.domain like "*.data.gov.in"
    || context.domain == "cpc.ncep.noaa.gov" || context.domain like "*.cpc.ncep.noaa.gov"
    || context.domain == "noaa.gov" || context.domain like "*.noaa.gov"
    || context.domain == "open-meteo.com" || context.domain like "*.open-meteo.com"
    || context.domain == "nasa.gov" || context.domain like "*.nasa.gov"
    || context.domain == "pmfby.gov.in" || context.domain like "*.pmfby.gov.in"
    || context.domain == "pmkisan.gov.in" || context.domain like "*.pmkisan.gov.in"
    || context.domain == "agmarknet.gov.in" || context.domain like "*.agmarknet.gov.in"
    || context.domain == "enam.gov.in" || context.domain like "*.enam.gov.in"
    || context.domain == "farmer.gov.in" || context.domain like "*.farmer.gov.in"
    || context.domain == "india.gov.in" || context.domain like "*.india.gov.in"
    || context.domain == "isric.org" || context.domain like "*.isric.org"
    || context.domain == "weather.gov" || context.domain like "*.weather.gov"
  )
};

permit(principal is Sakha::Agent, action == Sakha::Action::"consult", resource is Sakha::Resource)
when {
  principal.farm == resource.farm
  && context.allowed
  && principal.role == "sakha"
  && (context.specialist == "megha" || context.specialist == "jal" || context.specialist == "kheti" || context.specialist == "paisa")
};
