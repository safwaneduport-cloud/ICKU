-- AlterTable
ALTER TABLE "AuthCredential" ADD COLUMN     "passwordChanged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tempPassword" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "attendanceCaptureScheme" TEXT,
ADD COLUMN     "attendanceNumber" TEXT,
ADD COLUMN     "attendanceTrackingPolicy" TEXT,
ADD COLUMN     "band" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "childrenNames" TEXT,
ADD COLUMN     "costCenter" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "currentAddrCity" TEXT,
ADD COLUMN     "currentAddrCountry" TEXT,
ADD COLUMN     "currentAddrLine1" TEXT,
ADD COLUMN     "currentAddrLine2" TEXT,
ADD COLUMN     "currentAddrState" TEXT,
ADD COLUMN     "currentAddrZip" TEXT,
ADD COLUMN     "dateOfBirth" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "dottedLineManager" TEXT,
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "employmentStatus" TEXT DEFAULT 'Working',
ADD COLUMN     "exitDate" TEXT,
ADD COLUMN     "exitStatus" TEXT,
ADD COLUMN     "expensePolicy" TEXT,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "holidayList" TEXT,
ADD COLUMN     "homePhone" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "leavePlan" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "marriageDate" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "mobilePhone" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "noticePeriod" TEXT,
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "payGrade" TEXT,
ADD COLUMN     "permanentAddrCity" TEXT,
ADD COLUMN     "permanentAddrCountry" TEXT,
ADD COLUMN     "permanentAddrLine1" TEXT,
ADD COLUMN     "permanentAddrLine2" TEXT,
ADD COLUMN     "permanentAddrState" TEXT,
ADD COLUMN     "permanentAddrZip" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "pfNumber" TEXT,
ADD COLUMN     "physicallyHandicapped" TEXT,
ADD COLUMN     "profileComments" TEXT,
ADD COLUMN     "reportingManagerEmpNo" TEXT,
ADD COLUMN     "resignationNote" TEXT,
ADD COLUMN     "secondaryJobTitle" TEXT,
ADD COLUMN     "shiftPolicy" TEXT,
ADD COLUMN     "spouseName" TEXT,
ADD COLUMN     "subDepartment" TEXT,
ADD COLUMN     "terminationReason" TEXT,
ADD COLUMN     "terminationType" TEXT,
ADD COLUMN     "timeType" TEXT,
ADD COLUMN     "uanNumber" TEXT,
ADD COLUMN     "weeklyOffPolicy" TEXT,
ADD COLUMN     "workPhone" TEXT,
ADD COLUMN     "workerType" TEXT;

-- CreateTable
CREATE TABLE "MasterOption" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterOption_type_idx" ON "MasterOption"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MasterOption_type_value_key" ON "MasterOption"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeNumber_key" ON "User"("employeeNumber");

-- CreateIndex
CREATE INDEX "User_employeeNumber_idx" ON "User"("employeeNumber");

