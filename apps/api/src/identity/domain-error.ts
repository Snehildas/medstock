export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidIdentityError extends DomainError {
  constructor() {
    super("invalid_identity", "The identity token is invalid.", 401);
  }
}

export class UnverifiedIdentityError extends DomainError {
  constructor() {
    super("unverified_identity", "The identity email is not verified.", 401);
  }
}

export class DisabledIdentityError extends DomainError {
  constructor() {
    super("disabled_identity", "This account cannot sign in.", 403);
  }
}

export class IdentityLinkRequiredError extends DomainError {
  constructor() {
    super(
      "identity_link_required",
      "This email already belongs to a MedStock user and cannot be linked automatically.",
      409,
    );
  }
}

export class UserNotFoundError extends DomainError {
  constructor() {
    super("user_not_found", "The user was not found.", 404);
  }
}

export class MembershipNotFoundError extends DomainError {
  constructor() {
    super("membership_not_found", "The membership was not found.", 404);
  }
}

export class OrganizationNotFoundError extends DomainError {
  constructor() {
    super("organization_not_found", "The organization was not found.", 404);
  }
}

export class OrganizationIneligibleError extends DomainError {
  constructor() {
    super(
      "organization_ineligible",
      "The organization cannot accept memberships.",
      409,
    );
  }
}

export class UserIneligibleError extends DomainError {
  constructor() {
    super("user_ineligible", "The user cannot receive a membership.", 409);
  }
}

export class InvalidMembershipRoleError extends DomainError {
  constructor(message: string) {
    super("invalid_membership_role", message, 422);
  }
}

export class DuplicateMembershipError extends DomainError {
  constructor() {
    super("duplicate_membership", "The user already belongs to this organization.", 409);
  }
}

export class UnauthorizedOrganizationError extends DomainError {
  constructor() {
    super("unauthorized_organization", "You cannot access this organization.", 403);
  }
}

export class InvalidMembershipTransitionError extends DomainError {
  constructor() {
    super(
      "invalid_membership_transition",
      "That membership status change is not allowed.",
      409,
    );
  }
}

export class CatalogForbiddenError extends DomainError {
  constructor() {
    super("catalog_forbidden", "Only a platform admin can change the catalog.", 403);
  }
}

export class MedicineNotFoundError extends DomainError {
  constructor() {
    super("medicine_not_found", "The medicine was not found.", 404);
  }
}

export class IngredientNotFoundError extends DomainError {
  constructor() {
    super("ingredient_not_found", "The ingredient was not found.", 404);
  }
}

export class ManufacturerNotFoundError extends DomainError {
  constructor() {
    super("manufacturer_not_found", "The manufacturer was not found.", 404);
  }
}

export class DuplicateCatalogRecordError extends DomainError {
  constructor() {
    super("duplicate_catalog_record", "A catalog record with that name already exists.", 409);
  }
}

export class InvalidCatalogTransitionError extends DomainError {
  constructor() {
    super("invalid_catalog_transition", "That catalog status change is not allowed.", 409);
  }
}

export class CatalogDraftRequiredError extends DomainError {
  constructor() {
    super("catalog_draft_required", "Only a draft medicine can be edited.", 409);
  }
}

export class ListingNotFoundError extends DomainError {
  constructor() {
    super("listing_not_found", "The listing was not found.", 404);
  }
}

export class ListingForbiddenError extends DomainError {
  constructor() {
    super("listing_forbidden", "You cannot manage this listing.", 403);
  }
}

export class DuplicateListingError extends DomainError {
  constructor() {
    super("duplicate_listing", "This distributor already has a listing for that pack.", 409);
  }
}

export class InvalidListingTransitionError extends DomainError {
  constructor() {
    super("invalid_listing_transition", "That listing status change is not allowed.", 409);
  }
}

export class PackNotFoundError extends DomainError {
  constructor() {
    super("pack_not_found", "The medicine pack was not found.", 404);
  }
}

export class OrganizationNotDistributorError extends DomainError {
  constructor() {
    super("organization_not_distributor", "Only a distributor organization can own listings.", 409);
  }
}

export class EnquiryNotFoundError extends DomainError {
  constructor() {
    super("enquiry_not_found", "The enquiry was not found.", 404);
  }
}

export class EnquiryForbiddenError extends DomainError {
  constructor() {
    super("enquiry_forbidden", "You cannot access this enquiry.", 403);
  }
}

export class InvalidEnquiryTransitionError extends DomainError {
  constructor() {
    super("invalid_enquiry_transition", "That enquiry status change is not allowed.", 409);
  }
}

export class EnquiryTargetUnavailableError extends DomainError {
  constructor() {
    super("enquiry_target_unavailable", "That listing cannot receive an enquiry.", 409);
  }
}

export class SelfEnquiryError extends DomainError {
  constructor() {
    super("self_enquiry", "An organization cannot enquire against its own listing.", 409);
  }
}

export class OrganizationNotRetailerError extends DomainError {
  constructor() {
    super("organization_not_retailer", "Only a retailer organization can submit an enquiry.", 409);
  }
}

export class ImportFileRejectedError extends DomainError {
  constructor(message: string) {
    super("import_file_rejected", message, 400);
  }
}

export class ImportNotFoundError extends DomainError {
  constructor() {
    super("import_not_found", "The import was not found.", 404);
  }
}

export class ImportForbiddenError extends DomainError {
  constructor() {
    super("import_forbidden", "You cannot access this import.", 403);
  }
}

export class SubmissionNotFoundError extends DomainError {
  constructor() {
    super("submission_not_found", "The medicine submission was not found.", 404);
  }
}

export class SubmissionForbiddenError extends DomainError {
  constructor() {
    super("submission_forbidden", "You cannot access this medicine submission.", 403);
  }
}

export class InvalidSubmissionTransitionError extends DomainError {
  constructor() {
    super("invalid_submission_transition", "That medicine submission can no longer be reviewed.", 409);
  }
}

export class DuplicatePendingSubmissionError extends DomainError {
  constructor() {
    super(
      "duplicate_pending_submission",
      "This organization already has a pending submission with that medicine name.",
      409,
    );
  }
}

export class ProfileContactRequiredError extends DomainError {
  constructor() {
    super(
      "profile_contact_required",
      "A published distributor profile needs a valid landline or mobile number.",
      400,
    );
  }
}

export class InvalidImportTransitionError extends DomainError {
  constructor() {
    super("invalid_import_transition", "That import status change is not allowed.", 409);
  }
}
