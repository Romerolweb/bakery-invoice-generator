module bakery-invoice-api

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.4.0
	github.com/swaggo/gin-swagger v1.6.0
	github.com/swaggo/swag v1.16.2
	gorm.io/driver/sqlite v1.5.4
	gorm.io/gorm v1.25.5
	github.com/go-playground/validator/v10 v10.16.0
	github.com/spf13/viper v1.17.0
	github.com/sirupsen/logrus v1.9.3
	github.com/aws/aws-lambda-go v1.41.0
	github.com/aws/aws-sdk-go-v2 v1.21.2
	github.com/aws/aws-sdk-go-v2/service/s3 v1.40.2
	github.com/golang-migrate/migrate/v4 v4.16.2
	github.com/joho/godotenv v1.4.0
)